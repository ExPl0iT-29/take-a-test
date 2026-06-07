-- Run this in Supabase SQL editor

create type user_role as enum ('admin', 'candidate');
create type question_type as enum ('mcq_single', 'mcq_multi', 'long_text');
create type attempt_status as enum ('in_progress', 'submitted', 'terminated');

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
  access_code text,
  created_at timestamptz default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests(id) on delete cascade,
  position int not null default 0,
  type question_type not null,
  prompt text not null,
  options jsonb,            -- [{id, text, image_url?}] for MCQ
  correct jsonb,            -- [option_id, ...] for MCQ
  points int not null default 1,
  image_url text
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
  kind text not null,       -- fullscreen_exit, tab_blur, paste_blocked, camera_off, snapshot, terminated
  detail jsonb,
  created_at timestamptz default now()
);

-- Storage: create a private bucket named "snapshots" via Supabase dashboard.

-- RLS
alter table profiles enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table attempts enable row level security;
alter table answers enable row level security;
alter table proctor_events enable row level security;

create policy "self read profile" on profiles for select using (auth.uid() = id);
create policy "self update profile" on profiles for update using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "admin manage tests" on tests for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "published tests readable" on tests for select
  using (is_published = true or owner_id = auth.uid());

create policy "questions readable with test" on questions for select
  using (exists(select 1 from tests t where t.id = test_id and (t.is_published or t.owner_id = auth.uid())));
create policy "admin manage questions" on questions for all
  using (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "own attempts" on attempts for all
  using (candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "own answers" on answers for all
  using (exists(select 1 from attempts a where a.id = attempt_id and (a.candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))))
  with check (exists(select 1 from attempts a where a.id = attempt_id and a.candidate_id = auth.uid()));

create policy "own events insert" on proctor_events for insert
  with check (exists(select 1 from attempts a where a.id = attempt_id and a.candidate_id = auth.uid()));
create policy "events read" on proctor_events for select
  using (exists(select 1 from attempts a where a.id = attempt_id and (a.candidate_id = auth.uid() or exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role text;
begin
  desired_role := coalesce(new.raw_user_meta_data->>'role', 'candidate');
  if desired_role not in ('admin', 'candidate') then
    desired_role := 'candidate';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    desired_role::user_role
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'handle_new_user failed: %', sqlerrm;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
