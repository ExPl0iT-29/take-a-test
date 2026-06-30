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
  access_code text,
  created_at timestamptz default now()
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

-- tests
create policy "admin manage tests" on tests for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "published tests readable" on tests for select
  using (is_published = true or owner_id = auth.uid());

-- questions
create policy "questions readable with test" on questions for select
  using (exists(select 1 from tests t where t.id = test_id and (t.is_published or t.owner_id = auth.uid())));
create policy "admin manage questions" on questions for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- answer_keys: admin only (no candidate policy = no candidate access)
create policy "admin manage answer_keys" on answer_keys for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- attempts
create policy "own attempts" on attempts for all
  using (candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- answers
create policy "own answers" on answers for all
  using (exists(select 1 from attempts a where a.id = attempt_id and (a.candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))))
  with check (exists(select 1 from attempts a where a.id = attempt_id and a.candidate_id = auth.uid()));

-- invites
create policy "admin manage invites" on invites for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "candidate read own invite" on invites for select to authenticated
  using (lower(email) = lower((select email from auth.users where id = auth.uid())));

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
