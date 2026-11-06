-- SL Game Hub: Phase 1 schema
create type public.app_role      as enum ('player', 'admin');
create type public.age_band      as enum ('under_13', '13_17', '18_plus');
create type public.game_mode     as enum ('single', 'multi');
create type public.game_status   as enum ('draft', 'review', 'approved', 'published', 'unpublished');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- Reference data -------------------------------------------------------
create table public.districts (
  id   smallint primary key generated always as identity,
  name text not null unique
);

create table public.categories (
  id         smallint primary key generated always as identity,
  slug       text not null unique check (slug ~ '^[a-z0-9-]{2,30}$'),
  name       text not null,
  sort_order smallint not null default 0
);

-- Profiles (1:1 with auth.users) ---------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 80),
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar      text not null default 'av_lion' check (avatar ~ '^av_[a-z]{3,12}$'),
  country     text not null default 'SL' check (char_length(country) = 2),
  district_id smallint references public.districts(id),
  age_band    public.age_band not null,
  role        public.app_role not null default 'player',
  is_public   boolean not null default true,
  banned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Games ----------------------------------------------------------------
create table public.games (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name         text not null check (char_length(name) between 2 and 60),
  description  text not null default '' check (char_length(description) <= 400),
  icon         text not null default '🎮',
  thumbnail_url text,
  category_id  smallint references public.categories(id),
  min_players  smallint not null default 1 check (min_players >= 1),
  max_players  smallint not null default 1,
  modes        public.game_mode[] not null default '{single}' check (array_length(modes, 1) >= 1),
  version      text not null default '1.0.0',
  status       public.game_status not null default 'draft',
  is_builtin   boolean not null default true,
  coming_soon  boolean not null default false,
  sort_order   int not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (min_players <= max_players)
);
create index games_status_sort_idx on public.games (status, sort_order);
create index games_category_idx    on public.games (category_id);
create index games_name_lower_idx  on public.games (lower(name));
create trigger games_updated before update on public.games
  for each row execute function public.set_updated_at();

-- Per-player stats -----------------------------------------------------
create table public.game_stats (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  game_id        uuid not null references public.games(id)    on delete cascade,
  played         int not null default 0,
  wins           int not null default 0,
  losses         int not null default 0,
  draws          int not null default 0,
  best_score     int not null default 0,
  last_played_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index game_stats_recent_idx on public.game_stats (user_id, last_played_at desc);

-- Abuse / content reports ---------------------------------------------
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  game_id        uuid references public.games(id) on delete set null,
  reason         text not null check (char_length(reason) between 3 and 60),
  details        text check (char_length(details) <= 1000),
  status         public.report_status not null default 'open',
  resolved_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

-- Functions ------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and not banned);
$$;

create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Create a profile when someone signs up. Metadata is validated by table CHECKs.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  band public.age_band := nullif(meta->>'age_band', '')::public.age_band; -- NULL fails NOT NULL: age is required
begin
  insert into public.profiles (id, full_name, username, age_band, is_public)
  values (new.id, trim(meta->>'full_name'), trim(meta->>'username'), band, band <> 'under_13');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block privilege escalation. SQL editor / service role (auth.uid() is null) may change anything.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role <> old.role or new.banned <> old.banned or new.age_band <> old.age_band then
      raise exception 'forbidden';
    end if;
  end if;
  if new.age_band = 'under_13' then new.is_public := false; end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Single-player stat tracking. (Multiplayer results will be written server-side in Phase 3.)
create or replace function public.record_play(p_game uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.games where id = p_game and status = 'published' and not coming_soon) then
    raise exception 'game unavailable';
  end if;
  insert into public.game_stats (user_id, game_id, played, last_played_at)
  values (auth.uid(), p_game, 1, now())
  on conflict (user_id, game_id)
  do update set played = public.game_stats.played + 1, last_played_at = now();
end $$;

create or replace function public.record_result(p_game uuid, p_result text, p_score int default 0) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_result not in ('win', 'loss', 'draw') then raise exception 'bad result'; end if;
  update public.game_stats set
    wins   = wins   + (p_result = 'win')::int,
    losses = losses + (p_result = 'loss')::int,
    draws  = draws  + (p_result = 'draw')::int,
    best_score = greatest(best_score, least(coalesce(p_score, 0), 100000000)),
    last_played_at = now()
  where user_id = auth.uid() and game_id = p_game;
end $$;
grant execute on function public.record_play(uuid), public.record_result(uuid, text, int) to authenticated;
