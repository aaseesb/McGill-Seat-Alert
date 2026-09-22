-- Run once in the Supabase SQL editor (or with `supabase db push`).

create extension if not exists pgcrypto;

-- One row per signed-in user, created automatically on sign-up
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  -- Unguessable ntfy topic the user subscribes to in the ntfy app
  ntfy_topic text not null unique default ('mcgill-seats-' || encode(gen_random_bytes(9), 'hex')),
  -- Lets email unsubscribe links work without signing in
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  term text not null check (term ~ '^\d{4}(01|05|09)$'),
  course_code text not null check (course_code ~ '^[A-Z]{3,4}-\d{3}[A-Z]?\d?$'),
  -- Empty means any section of the course
  crns text[] not null default '{}',
  notify text not null default 'both' check (notify in ('email', 'push', 'both')),
  active boolean not null default true,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, term, course_code)
);

create index subscriptions_active_idx on public.subscriptions (term, course_code) where active;

-- Cap subscriptions per user so one account can't make the checker do unbounded work
create function public.limit_subscriptions() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.subscriptions where user_id = new.user_id) >= 12 then
    raise exception 'You can watch at most 12 courses.';
  end if;
  return new;
end $$;

create trigger subscriptions_limit
  before insert on public.subscriptions
  for each row execute function public.limit_subscriptions();

-- Last seen status per section, so alerts fire only when a section goes from full to open
create table public.section_state (
  term text not null,
  course_code text not null,
  crn text not null,
  section_type text,
  seats integer not null default 0,
  waitlist integer not null default 0,
  available boolean not null default false,
  checked_at timestamptz not null default now(),
  primary key (term, course_code, crn)
);

-- Heartbeat of the checker, shown on the site
create table public.checker_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  courses_checked integer not null default 0,
  alerts_sent integer not null default 0,
  errors text[] not null default '{}'
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.section_state enable row level security;
alter table public.checker_runs enable row level security;

create policy "own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "own subscriptions" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seat counts and checker health are public information
create policy "read section state" on public.section_state for select using (true);
create policy "read checker runs" on public.checker_runs for select using (true);
