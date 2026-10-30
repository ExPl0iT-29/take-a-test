-- Take A Test — full Supabase schema
-- Run this once in the Supabase SQL editor on a fresh project.
-- Idempotent where possible, but designed for first-run setup.

------------------------------------------------------------
-- Enums
------------------------------------------------------------
create type user_role as enum ('admin', 'candidate');
create type question_type as enum ('mcq_single', 'mcq_multi', 'long_text');
create type attempt_status as enum ('in_progress', 'submitted', 'terminated');

------------------------------------------------------------
-- Tables
------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'candidate',
  created_at timestamptz default now()
);

create table tests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  duration_minutes int not null default 30,
  is_published boolean default false,
  require_seb boolean not null default false,
  invite_only boolean not null default false,
  created_at timestamptz default now()
);

-- Admin-only, same as answer_keys: kept out of the `tests` row so the
-- "published tests readable" policy (which any signed-in candidate hits)
-- can never expose it. Candidates never select this table directly — the
-- server compares codes with the service-role client.
create table test_secrets (
  test_id uuid primary key references tests(id) on delete cascade,
  access_code text,
  -- Per-test Browser Exam Key: SEB_ENFORCE/SEB_BROWSER_EXAM_KEY is a
  -- site-wide fallback, but a specific test's "SEB mandatory" flag must
  -- never degrade to a presence-only header check (see lib/seb.ts) — it
  -- either has its own key and gets verified cryptographically, or it has
  -- none and is denied to everyone.
  seb_browser_exam_key text,
  seb_exit_password text
);

-- Questions never store the correct answer; that lives in answer_keys.
create table questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  position int not null default 0,
  type question_type not null,
  prompt text not null,
  options jsonb,            -- [{id, text, image_url?}] for MCQ
  points int not null default 1,
  image_url text
);

-- Admin-only. Candidates cannot read this table (no policy granted to them).
create table answer_keys (
  question_id uuid primary key references questions(id) on delete cascade,
  correct jsonb               -- [option_id, ...] for MCQ
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  candidate_id uuid not null references profiles(id) on delete cascade,
  status attempt_status not null default 'in_progress',
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score numeric,
  unlocked boolean not null default false,
  -- Single-session enforcement (see /api/test/[id]/answer/route.ts): the
  -- first answer-save binds this attempt to a server-generated token held
  -- in an httpOnly cookie. A later request with a missing/different token
  -- is a second device — session_locked blocks further writes until an
  -- admin explicitly clears it (see /api/admin/attempts/[id]/resume).
  session_token text,
  session_ua text,
  session_ip text,
  session_locked boolean not null default false,
  unique (test_id, candidate_id)
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  response jsonb,           -- {selected:[ids]} or {text:"..."}
  score numeric,
  feedback text,
  updated_at timestamptz default now(),
  unique (attempt_id, question_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  email text not null,
  code text not null unique,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (test_id, email)
);

create table proctor_events (
  id bigserial primary key,
  attempt_id uuid not null references attempts(id) on delete cascade,
  kind text not null,       -- fullscreen_exit, tab_blur, paste_blocked, camera_off, snapshot, unlock_failed, terminated, ...
  detail jsonb,
  created_at timestamptz default now()
);

------------------------------------------------------------
-- Row-Level Security
------------------------------------------------------------
alter table profiles enable row level security;
alter table tests enable row level security;
alter table test_secrets enable row level security;
alter table questions enable row level security;
alter table answer_keys enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;
alter table invites enable row level security;
alter table proctor_events enable row level security;

-- profiles
create policy "self read profile" on profiles for select using (auth.uid() = id);
create policy "self update profile" on profiles for update using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);

-- RLS alone can't stop a candidate updating their own `role` column via
-- this policy — add a column-level grant so self-update can only ever
-- touch full_name. Admin promotion stays SQL-only (see bottom of file).
revoke update on profiles from authenticated;
grant update (full_name) on profiles to authenticated;

-- Same issue on insert: the policy only checks id = auth.uid(), so a
-- candidate could race the signup trigger with their own insert carrying
-- role='admin'. role keeps its table default ('candidate') either way.
revoke insert on profiles from authenticated;
grant insert (id, email, full_name) on profiles to authenticated;

-- tests
create policy "admin manage tests" on tests for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
-- `to authenticated`: without it this policy (and the questions one below,
-- transitively) has no role restriction, so it also applies to `anon` —
-- a fully unauthenticated caller using only the public anon key could
-- select every published test's title (and, via questions, its full
-- content) with no account at all. Confirmed live before this fix.
create policy "published tests readable" on tests for select to authenticated
  using (is_published = true or owner_id = auth.uid());

-- test_secrets: admin only (no candidate policy = no candidate access,
-- same pattern as answer_keys above).
create policy "admin manage test_secrets" on test_secrets for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- questions
-- Previously readable by anyone (including anon) once the test was
-- published, regardless of whether they'd ever started it. Now requires
-- sign-in AND an actual unlocked attempt — questions are served only once
-- a candidate has passed the code/invite gate, not just because the test
-- exists and is published.
-- Helper for the policy below: test_secrets and invites are themselves
-- RLS-restricted (admin-only / own-row-only), so a plain subquery against
-- them from inside another table's policy sees nothing for a non-admin
-- caller regardless of what's actually there — SECURITY DEFINER is
-- required to evaluate "does this test actually need a code" truthfully.
create or replace function public.test_requires_code(p_test_id uuid, p_email text)
returns boolean
language sql security definer set search_path = public
as $$
  select exists(select 1 from test_secrets where test_id = p_test_id and access_code is not null)
      or exists(select 1 from invites where test_id = p_test_id and used_at is null and lower(email) = lower(p_email));
$$;
revoke execute on function public.test_requires_code(uuid, text) from public, anon;
grant execute on function public.test_requires_code(uuid, text) to authenticated;

create policy "questions readable with test" on questions for select to authenticated
  using (
    exists(select 1 from tests t where t.id = test_id and t.owner_id = auth.uid())
    or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists(
      select 1 from attempts a
      where a.test_id = questions.test_id and a.candidate_id = auth.uid()
        and (
          -- Unlocked via the real unlock flow, OR this test never needed
          -- one in the first place (no global code, no pending invite) —
          -- mirrors app/test/[id]/page.tsx's own codeRequired logic so a
          -- fully open test isn't accidentally locked out forever.
          a.unlocked = true
          or not public.test_requires_code(a.test_id, auth.jwt() ->> 'email')
        )
    )
  );
create policy "admin manage questions" on questions for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Editing a question's type/options/prompt after a candidate has already
-- answered it would silently corrupt their stored response (e.g. an MCQ
-- option id they picked no longer exists). points is left editable —
-- rubric adjustments after the fact are a legitimate admin decision.
create or replace function public.prevent_question_edit_if_answered()
returns trigger language plpgsql as $$
begin
  if (new.type is distinct from old.type
      or new.options is distinct from old.options
      or new.prompt is distinct from old.prompt)
     and exists(select 1 from answers a where a.question_id = old.id)
  then
    raise exception 'Cannot edit a question once a candidate has answered it (question %)', old.id;
  end if;
  return new;
end; $$;

drop trigger if exists lock_answered_question on questions;
create trigger lock_answered_question before update on questions
  for each row execute function public.prevent_question_edit_if_answered();

-- answer_keys: admin only (no candidate policy = no candidate access)
create policy "admin manage answer_keys" on answer_keys for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- attempts
-- Candidates may read their own attempt and create it, but never write to
-- it directly — score, status and unlocked are set exclusively by the
-- submit_attempt() SECURITY DEFINER function or the service-role key
-- (see unlock/route.ts), never by a client-side table update. A blanket
-- FOR ALL policy here previously let a candidate set their own score,
-- status or unlocked flag straight from the browser.
create policy "own attempts read" on attempts for select
  using (candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "own attempts insert" on attempts for insert
  with check (candidate_id = auth.uid());
create policy "admin update attempts" on attempts for update
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- The insert policy only checks candidate_id — without this grant a
-- candidate could insert their own attempt row with score/status/unlocked
-- already set to whatever they like. Limit self-insert to the two columns
-- the app actually sets; everything else keeps its table default.
revoke insert on attempts from authenticated;
grant insert (test_id, candidate_id) on attempts to authenticated;

-- answers
-- score/feedback are set exclusively by the grading route (service-role
-- client) — nothing stopped a candidate from upserting their own score or
-- feedback directly otherwise (RLS only ever checked attempt ownership
-- and time, not which columns were touched).
revoke insert, update on answers from authenticated;
grant insert (attempt_id, question_id, response, updated_at) on answers to authenticated;
grant update (response, updated_at) on answers to authenticated;

-- WITH CHECK mirrors USING's admin branch (an admin saving a manual grade
-- on someone else's long-answer would otherwise fail RLS), and additionally
-- enforces the exam timer server-side: ExamRoom.tsx's countdown is a UI
-- convenience only — without this, nothing stopped a candidate who paused
-- or bypassed the client timer from still upserting answers after time's up.
-- 2-minute grace absorbs network latency around the client's own cutoff.
create policy "own answers" on answers for all
  using (exists(select 1 from attempts a where a.id = attempt_id and (a.candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))))
  with check (
    exists(
      select 1 from attempts a join tests t on t.id = a.test_id
      where a.id = attempt_id
        and (
          (a.candidate_id = auth.uid() and a.status = 'in_progress'
           and now() <= a.started_at + (t.duration_minutes || ' minutes')::interval + interval '2 minutes')
          or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
        )
    )
  );

-- invites
create policy "admin manage invites" on invites for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "candidate read own invite" on invites for select to authenticated
  using (lower(email) = lower((select email from auth.users where id = auth.uid())));

-- The row policy above (and admin's own FOR ALL select) would otherwise let
-- a candidate read their own `code` straight from the browser, making the
-- unlock step pointless — they're meant to receive it out-of-band from the
-- admin, not read it back from the table. Admin's invite list page reads
-- the real code via /api/admin/tests/[id]/invites (service-role) instead.
revoke select on invites from authenticated;
grant select (id, test_id, email, used_at, created_at) on invites to authenticated;

-- proctor events
create policy "own events insert" on proctor_events for insert
  with check (exists(select 1 from attempts a where a.id = attempt_id and a.candidate_id = auth.uid()));
create policy "events read" on proctor_events for select
  using (exists(select 1 from attempts a where a.id = attempt_id and (a.candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))));

------------------------------------------------------------
-- Signup trigger — always creates as candidate.
-- Admins are promoted manually via SQL after first login.
------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'candidate'::user_role
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user failed: %', sqlerrm;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Don't expose the trigger function as a callable RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

------------------------------------------------------------
-- Server-side grading function.
-- Runs as the function owner so it can read answer_keys, but checks
-- the caller's identity matches the attempt being graded.
------------------------------------------------------------
create or replace function public.submit_attempt(p_attempt_id uuid, p_terminated boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_test_id uuid;
  v_status attempt_status;
  v_total numeric := 0;
  r record;
  s numeric;
  resp jsonb;
  correct jsonb;
  match boolean;
begin
  if v_user_id is null then raise exception 'not signed in'; end if;

  select test_id, status into v_test_id, v_status
  from attempts where id = p_attempt_id and candidate_id = v_user_id;
  if v_test_id is null then raise exception 'attempt not found'; end if;
  if v_status <> 'in_progress' then raise exception 'attempt not in progress'; end if;

  for r in
    select a.id as aid, q.id as qid, q.type, q.points, a.response, k.correct,
           coalesce(a.score, 0) as existing_score
    from answers a
    join questions q on q.id = a.question_id
    left join answer_keys k on k.question_id = q.id
    where a.attempt_id = p_attempt_id
  loop
    s := 0;
    if r.type = 'long_text' then
      s := r.existing_score;
    else
      resp := coalesce(r.response->'selected', '[]'::jsonb);
      correct := coalesce(r.correct, '[]'::jsonb);
      if r.type = 'mcq_single'
         and jsonb_array_length(resp) = 1
         and exists (select 1 from jsonb_array_elements_text(correct) c where c = resp->>0) then
        s := r.points;
      elsif r.type = 'mcq_multi'
         and jsonb_array_length(resp) = jsonb_array_length(correct) then
        select bool_and(elem in (select jsonb_array_elements_text(correct)))
          into match from jsonb_array_elements_text(resp) elem;
        if coalesce(match, false) then s := r.points; end if;
      end if;
      update answers set score = s where id = r.aid;
    end if;
    v_total := v_total + s;
  end loop;

  update attempts
    set status = case when p_terminated then 'terminated'::attempt_status else 'submitted'::attempt_status end,
        submitted_at = now(),
        score = v_total
    where id = p_attempt_id;
end; $$;

revoke execute on function public.submit_attempt(uuid, boolean) from public, anon;
grant execute on function public.submit_attempt(uuid, boolean) to authenticated;

------------------------------------------------------------
-- Storage buckets + policies
------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('snapshots', 'snapshots', false, 204800,
          array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('question-images', 'question-images', true, 5242880,
          array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- snapshots: candidate writes ONLY to their own attempt folder; only admins read.
create policy "snapshots candidate upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'snapshots'
    and (storage.foldername(name))[1] in (
      select id::text from public.attempts where candidate_id = auth.uid()
    )
  );

create policy "snapshots admin read" on storage.objects for select to authenticated
  using (
    bucket_id = 'snapshots'
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- question-images: admin write; public read happens via the bucket's public URL
-- (no SELECT policy on storage.objects — prevents listing all files).
create policy "question-images admin write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'question-images'
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "question-images admin update" on storage.objects for update to authenticated
  using (
    bucket_id = 'question-images'
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "question-images admin delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'question-images'
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

------------------------------------------------------------
-- Done. Next:
--   1. Sign up at /signup
--   2. update public.profiles set role='admin' where email='you@example.com';
--   3. Sign out + back in → /admin
------------------------------------------------------------
