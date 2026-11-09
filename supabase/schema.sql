-- SL Game Hub: full database schema (Supabase project rpvnwjpccwzbtxvoeybj)
-- All migrations (0001-0014) followed by seed data, in the order they run.
-- Run once on an empty project. Regenerate after adding a migration.
-- Includes the Dice game (2-8 players) on the games dashboard: see 0013_dice.sql and the seed below.

-- ===================================================================
-- migrations/0001_schema.sql
-- ===================================================================
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

-- ===================================================================
-- migrations/0002_rls.sql
-- ===================================================================
-- Row Level Security on EVERY table
alter table public.districts  enable row level security;
alter table public.categories enable row level security;
alter table public.profiles   enable row level security;
alter table public.games      enable row level security;
alter table public.game_stats enable row level security;
alter table public.reports    enable row level security;

-- Least privilege at the grant level too
revoke all on public.profiles, public.game_stats, public.reports from anon;
revoke insert, delete on public.profiles from authenticated;       -- rows are created by trigger, removed by cascade
revoke insert, update, delete on public.game_stats from authenticated; -- written only via record_play/record_result

-- districts & categories: public read, admin write
create policy districts_read  on public.districts  for select using (true);
create policy categories_read on public.categories for select using (true);
create policy districts_admin  on public.districts  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin()
  or (is_public and age_band <> 'under_13' and not banned)
);
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid() and not banned) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- games: anyone browses published games; only admins see/modify the rest
create policy games_read  on public.games for select using (status = 'published' or public.is_admin());
create policy games_admin on public.games for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- game_stats: read own (admin reads all). No direct writes.
create policy stats_read on public.game_stats for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- reports
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and resolved_by is null);
create policy reports_read   on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================================================================
-- migrations/0003_storage.sql
-- ===================================================================
-- Buckets. (Avatars are preset emoji ids in Phase 1, so no avatar bucket is needed yet.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('game-thumbnails', 'game-thumbnails', true,  524288,   array['image/webp','image/png','image/jpeg']),
  ('game-bundles',    'game-bundles',    false, 10485760, array['application/zip'])
on conflict (id) do nothing;

create policy thumbs_read  on storage.objects for select using (bucket_id = 'game-thumbnails');
create policy thumbs_admin on storage.objects for all to authenticated
  using (bucket_id = 'game-thumbnails' and public.is_admin())
  with check (bucket_id = 'game-thumbnails' and public.is_admin());
create policy bundles_admin on storage.objects for all to authenticated
  using (bucket_id = 'game-bundles' and public.is_admin())
  with check (bucket_id = 'game-bundles' and public.is_admin());

-- ===================================================================
-- migrations/0004_snake_published.sql
-- ===================================================================
-- Mark Snake and Snake & Ladder as published (no longer coming_soon)
update public.games
set coming_soon = false
where slug in ('snake', 'snake-and-ladder');

-- ===================================================================
-- migrations/0005_multiplayer.sql
-- ===================================================================
-- Phase 3: Multiplayer Features
-- Friend system, game rooms, matchmaking, game history, Elo ratings

-- Friend system -----------------------------------------------------------
create type public.friend_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id  uuid not null references public.profiles(id) on delete cascade,
  status      public.friend_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (requester_id, receiver_id),
  check (requester_id <> receiver_id)
);
create index friendships_user_idx on public.friendships (requester_id, status);
create index friendships_receiver_idx on public.friendships (receiver_id, status);
create trigger friendships_updated before update on public.friendships
  for each row execute function public.set_updated_at();

-- Game rooms (private multiplayer games) ---------------------------------
create type public.room_status as enum ('waiting', 'active', 'completed', 'abandoned');

create table public.game_rooms (
  id           uuid primary key default gen_random_uuid(),
  room_code    text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  host_id      uuid not null references public.profiles(id) on delete cascade,
  game_id      uuid not null references public.games(id) on delete cascade,
  max_players  smallint not null default 2 check (max_players between 2 and 4),
  status       public.room_status not null default 'waiting',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz
);
create index game_rooms_host_idx on public.game_rooms (host_id, status);
create index game_rooms_code_idx on public.game_rooms (room_code);
create index game_rooms_status_idx on public.game_rooms (status, created_at desc);
create trigger game_rooms_updated before update on public.game_rooms
  for each row execute function public.set_updated_at();

-- Room participants -------------------------------------------------------
create table public.room_participants (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.game_rooms(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  is_ready   boolean not null default false,
  unique (room_id, user_id)
);
create index room_participants_room_idx on public.room_participants (room_id);
create index room_participants_user_idx on public.room_participants (user_id);

-- Matchmaking queue -------------------------------------------------------
create type public.queue_status as enum ('queued', 'matched', 'cancelled', 'timeout');

create table public.matchmaking_queue (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  status     public.queue_status not null default 'queued',
  elo_rating int not null default 1000,
  queued_at  timestamptz not null default now(),
  matched_at timestamptz,
  timeout_at timestamptz not null default (now() + interval '5 minutes')
);
create index matchmaking_queue_user_idx on public.matchmaking_queue (user_id, status);
create index matchmaking_queue_game_idx on public.matchmaking_queue (game_id, status, elo_rating);
create index matchmaking_queue_timeout_idx on public.matchmaking_queue (status, timeout_at);

-- Game history/matches ----------------------------------------------------
create type public.match_result as enum ('win', 'loss', 'draw', 'forfeit', 'abandoned');

create table public.game_matches (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid references public.game_rooms(id) on delete set null,
  game_id      uuid not null references public.games(id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms  int,
  final_state  jsonb, -- serialized game state
  created_at   timestamptz not null default now()
);
create index game_matches_room_idx on public.game_matches (room_id);
create index game_matches_game_idx on public.game_matches (game_id, completed_at desc);
create index game_matches_user_idx on public.game_matches (id) -- Will be used via match_participants
  where completed_at is not null;

-- Match participants (results per player) ---------------------------------
create table public.match_participants (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.game_matches(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  result       public.match_result not null,
  score        int not null default 0,
  elo_change   int not null default 0,
  new_elo      int not null,
  moves_made   int not null default 0,
  time_used_ms int not null default 0
);
create index match_participants_match_idx on public.match_participants (match_id);
create index match_participants_user_idx on public.match_participants (user_id, match_id);
create index match_participants_result_idx on public.match_participants (user_id, result, match_id);

-- Elo ratings per game ----------------------------------------------------
create table public.elo_ratings (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    uuid not null references public.games(id) on delete cascade,
  rating     int not null default 1000,
  games_played int not null default 0,
  wins       int not null default 0,
  losses     int not null default 0,
  draws      int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index elo_ratings_user_idx on public.elo_ratings (user_id);
create index elo_ratings_game_idx on public.elo_ratings (game_id, rating desc);
create trigger elo_ratings_updated before update on public.elo_ratings
  for each row execute function public.set_updated_at();

-- Move history for replay ------------------------------------------------
create table public.game_moves (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.game_matches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  move_order int not null,
  move_data  jsonb not null, -- serialized move
  timestamp  timestamptz not null default now()
);
create index game_moves_match_idx on public.game_moves (match_id, move_order);

-- Functions for friend system ---------------------------------------------
create or replace function public.send_friend_request(p_target_user_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_friendship_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if auth.uid() = p_target_user_id then raise exception 'cannot friend yourself'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'user not found';
  end if;
  if exists (
    select 1 from public.friendships
    where (requester_id = auth.uid() and receiver_id = p_target_user_id)
       or (requester_id = p_target_user_id and receiver_id = auth.uid())
  ) then
    raise exception 'friendship already exists';
  end if;

  insert into public.friendships (requester_id, receiver_id, status)
  values (auth.uid(), p_target_user_id, 'pending')
  returning id into v_friendship_id;

  return v_friendship_id;
end $$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;

  update public.friendships
  set status = case when p_accept then 'accepted' else 'blocked' end,
      updated_at = now()
  where id = p_friendship_id
    and receiver_id = auth.uid()
    and status = 'pending';

  if not found then raise exception 'request not found'; end if;
end $$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;

  delete from public.friendships
  where id = p_friendship_id
    and status = 'accepted'
    and (requester_id = auth.uid() or receiver_id = auth.uid());

  if not found then raise exception 'friendship not found'; end if;
end $$;

-- Functions for game rooms ------------------------------------------------
create or replace function public.create_room(p_game_id uuid, p_max_players smallint default 2)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_room_code text;
  v_code_exists boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.games where id = p_game_id and status = 'published') then
    raise exception 'game not available';
  end if;

  -- Generate unique room code
  loop
    v_room_code := upper(substring(encode(gen_random_bytes(3), 'base64'), 1, 6));
    select exists(select 1 from public.game_rooms where room_code = v_room_code) into v_code_exists;
    exit when not v_code_exists;
  end loop;

  insert into public.game_rooms (room_code, host_id, game_id, max_players)
  values (v_room_code, auth.uid(), p_game_id, p_max_players)
  returning id into v_room_id;

  -- Add host as first participant
  insert into public.room_participants (room_id, user_id, is_ready)
  values (v_room_id, auth.uid(), true);

  return jsonb_build_object(
    'room_id', v_room_id,
    'room_code', v_room_code
  );
end $$;

create or replace function public.join_room(p_room_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_current_count int;
  v_max_players smallint;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;

  select id, max_players into v_room_id, v_max_players
  from public.game_rooms
  where room_code = p_room_code and status = 'waiting';

  if not found then raise exception 'room not found or not available'; end if;

  select count(*) into v_current_count
  from public.room_participants
  where room_id = v_room_id and left_at is null;

  if v_current_count >= v_max_players then raise exception 'room is full'; end if;

  insert into public.room_participants (room_id, user_id)
  values (v_room_id, auth.uid());

  return v_room_id;
end $$;

-- Functions for matchmaking -----------------------------------------------
create or replace function public.join_matchmaking(p_game_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_queue_id uuid;
  v_current_elo int;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.games where id = p_game_id and status = 'published') then
    raise exception 'game not available';
  end if;

  -- Cancel any existing queue entries
  update public.matchmaking_queue
  set status = 'cancelled'
  where user_id = auth.uid() and status = 'queued';

  -- Get current Elo rating
  select coalesce(rating, 1000) into v_current_elo
  from public.elo_ratings
  where user_id = auth.uid() and game_id = p_game_id;

  insert into public.matchmaking_queue (user_id, game_id, elo_rating)
  values (auth.uid(), p_game_id, v_current_elo)
  returning id into v_queue_id;

  return v_queue_id;
end $$;

create or replace function public.leave_matchmaking(p_queue_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;

  update public.matchmaking_queue
  set status = 'cancelled'
  where id = p_queue_id and user_id = auth.uid() and status = 'queued';

  if not found then raise exception 'queue entry not found'; end if;
end $$;

-- Functions for Elo rating calculation -------------------------------------
create or replace function public.calculate_elo(p_rating1 int, p_rating2 int, p_result int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_expected float;
  v_k_factor int := 32;
  v_new_rating int;
begin
  -- p_result: 1 for win, 0.5 for draw, 0 for loss
  v_expected := 1.0 / (1.0 + power(10.0, (p_rating2 - p_rating1) / 400.0));
  v_new_rating := p_rating1 + floor(v_k_factor * (p_result - v_expected));
  return v_new_rating;
end $$;

create or replace function public.update_elo_after_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_participant record;
  v_opponent_elo int;
  v_result float;
  v_new_elo int;
begin
  for v_participant in
    select mp.user_id, mp.elo_change, mp.result, e.rating as current_elo, g.id as game_id
    from public.match_participants mp
    join public.elo_ratings e on e.user_id = mp.user_id and e.game_id = (select game_id from public.game_matches where id = p_match_id)
    where mp.match_id = p_match_id
  loop
    -- Find opponent's Elo
    select coalesce(e.rating, 1000) into v_opponent_elo
    from public.match_participants mp2
    join public.elo_ratings e on e.user_id = mp2.user_id and e.game_id = v_participant.game_id
    where mp2.match_id = p_match_id and mp2.user_id <> v_participant.user_id
    limit 1;

    -- Calculate result for Elo (1=win, 0.5=draw, 0=loss)
    v_result := case v_participant.result
      when 'win' then 1.0
      when 'draw' then 0.5
      when 'loss' then 0.0
      else 0.0
    end;

    v_new_elo := public.calculate_elo(v_participant.current_elo, v_opponent_elo, v_result::int);

    -- Update Elo ratings
    update public.elo_ratings
    set rating = v_new_elo,
        games_played = games_played + 1,
        wins = wins + (v_participant.result = 'win')::int,
        losses = losses + (v_participant.result = 'loss')::int,
        draws = draws + (v_participant.result = 'draw')::int,
        updated_at = now()
    where user_id = v_participant.user_id and game_id = v_participant.game_id;

    -- Update match participant with Elo change
    update public.match_participants
    set elo_change = v_new_elo - v_participant.current_elo,
        new_elo = v_new_elo
    where id = v_participant.id;
  end loop;
end $$;

-- Grant execute permissions
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.create_room(uuid, smallint) to authenticated;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.join_matchmaking(uuid) to authenticated;
grant execute on function public.leave_matchmaking(uuid) to authenticated;

-- ===================================================================
-- migrations/0006_multiplayer_rls.sql
-- ===================================================================
-- Row Level Security for Phase 3 Multiplayer Tables

alter table public.friendships enable row level security;
alter table public.game_rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.game_matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.elo_ratings enable row level security;
alter table public.game_moves enable row level security;

-- Revoke direct access
revoke all on public.friendships, public.game_rooms, public.room_participants,
                public.matchmaking_queue, public.game_matches, public.match_participants,
                public.elo_ratings, public.game_moves from anon, authenticated;

-- Friendships RLS
create policy friendships_read_own on public.friendships for select to authenticated
  using (requester_id = auth.uid() or receiver_id = auth.uid() or public.is_admin());

create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = auth.uid());

create policy friendships_update_own on public.friendships for update to authenticated
  using ((requester_id = auth.uid() or receiver_id = auth.uid())
         and not exists (select 1 from public.profiles where id = auth.uid() and banned))
  with check ((requester_id = auth.uid() or receiver_id = auth.uid()));

create policy friendships_admin on public.friendships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Game Rooms RLS
create policy game_rooms_read on public.game_rooms for select to authenticated
  using (host_id = auth.uid()
         or exists (select 1 from public.room_participants where room_id = game_rooms.id and user_id = auth.uid())
         or public.is_admin());

create policy game_rooms_insert on public.game_rooms for insert to authenticated
  with check (host_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy game_rooms_update_host on public.game_rooms for update to authenticated
  using (host_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned))
  with check (host_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy game_rooms_admin on public.game_rooms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Room Participants RLS
create policy room_participants_read on public.room_participants for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.game_rooms where id = room_participants.room_id and host_id = auth.uid())
         or public.is_admin());

create policy room_participants_insert on public.room_participants for insert to authenticated
  with check (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy room_participants_update_own on public.room_participants for update to authenticated
  using (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned))
  with check (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy room_participants_admin on public.room_participants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Matchmaking Queue RLS
create policy matchmaking_queue_read_own on public.matchmaking_queue for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy matchmaking_queue_insert on public.matchmaking_queue for insert to authenticated
  with check (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy matchmaking_queue_update_own on public.matchmaking_queue for update to authenticated
  using (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned))
  with check (user_id = auth.uid()
         and not exists (select 1 from public.profiles where id = auth.uid() and banned));

create policy matchmaking_queue_admin on public.matchmaking_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Game Matches RLS
create policy game_matches_read on public.game_matches for select to authenticated
  using (exists (select 1 from public.match_participants where match_id = game_matches.id and user_id = auth.uid())
         or public.is_admin());

create policy game_matches_insert on public.game_matches for insert to authenticated
  with check (true); -- Will be inserted by server function

create policy game_matches_admin on public.game_matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Match Participants RLS
create policy match_participants_read on public.match_participants for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.match_participants where match_id = match_participants.match_id and user_id = auth.uid())
         or public.is_admin());

create policy match_participants_insert on public.match_participants for insert to authenticated
  with check (true); -- Will be inserted by server function

create policy match_participants_admin on public.match_participants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Elo Ratings RLS
create policy elo_ratings_read_own on public.elo_ratings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy elo_ratings_read_public on public.elo_ratings for select to authenticated
  using (true); -- Public Elo ratings are visible to all authenticated users

create policy elo_ratings_update_server on public.elo_ratings for update to authenticated
  with check (false); -- Only updated via server functions

create policy elo_ratings_admin on public.elo_ratings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Game Moves RLS
create policy game_moves_read on public.game_moves for select to authenticated
  using (exists (select 1 from public.match_participants where match_id = game_moves.match_id and user_id = auth.uid())
         or public.is_admin());

create policy game_moves_insert on public.game_moves for insert to authenticated
  with check (true); -- Will be inserted by server function

create policy game_moves_admin on public.game_moves for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================================================================
-- migrations/0007_game_versions.sql
-- ===================================================================
-- Game versions for rollback support and version history
create table public.game_versions (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  version       text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  bundle_path   text not null, -- storage path in game-bundles bucket
  thumbnail_path text,
  manifest      jsonb not null, -- game manifest JSON
  changelog     text check (char_length(changelog) <= 1000),
  status        public.game_status not null default 'draft',
  is_current    boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (game_id, version)
);
create index game_versions_game_idx on public.game_versions (game_id, created_at desc);
create index game_versions_current_idx on public.game_versions (game_id) where is_current = true;

-- Ensure only one current version per game
create or replace function public.enforce_single_current_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_current = true then
    update public.game_versions set is_current = false where game_id = new.game_id and id <> new.id;
  end if;
  return new;
end $$;
create trigger game_versions_current_check before insert or update on public.game_versions
  for each row execute function public.enforce_single_current_version();

-- Update main game when version is published
create or replace function public.sync_game_to_current_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_current = true and new.status = 'published' then
    update public.games
    set
      version = new.version,
      thumbnail_url = new.thumbnail_path,
      updated_at = now()
    where id = new.game_id;
  end if;
  return new;
end $$;
create trigger game_versions_sync before update on public.game_versions
  for each row execute function public.sync_game_to_current_version();

-- RLS: only admins can manage versions
alter table public.game_versions enable row level security;
create policy versions_read_all on public.game_versions for select using (true);
create policy versions_admin on public.game_versions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- migrations/0008_leaderboards.sql
-- ===================================================================
-- Leaderboards for tracking high scores
create type public.leaderboard_type as enum ('global', 'per_game', 'weekly', 'monthly', 'per_district');

create table public.leaderboards (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid references public.games(id) on delete cascade,
  type         public.leaderboard_type not null,
  district_id  smallint references public.districts(id) on delete set null,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (
    (type = 'per_district' and district_id is not null) or
    (type <> 'per_district' and district_id is null)
  )
);
create index leaderboards_game_idx on public.leaderboards(game_id);
create index leaderboards_type_idx on public.leaderboards(type);
create index leaderboards_district_idx on public.leaderboards(district_id);
create trigger leaderboards_updated before update on public.leaderboards
  for each row execute function public.set_updated_at();

-- Leaderboard entries
create table public.leaderboard_entries (
  id            uuid primary key default gen_random_uuid(),
  leaderboard_id uuid not null references public.leaderboards(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  score         int not null,
  rank          int,
  metadata      jsonb,
  achieved_at   timestamptz not null default now(),
  unique (leaderboard_id, user_id)
);
create index leaderboard_entries_leaderboard_idx on public.leaderboard_entries(leaderboard_id, score desc);
create index leaderboard_entries_user_idx on public.leaderboard_entries(user_id);
create index leaderboard_entries_achieved_idx on public.leaderboard_entries(achieved_at desc);

-- Function to update leaderboard entry (upsert)
create or replace function public.update_leaderboard_entry(
  p_leaderboard_id uuid,
  p_user_id uuid,
  p_score int,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and banned) then
    -- Check if user is trying to update their own entry or is admin
    if auth.uid() <> p_user_id and not public.is_admin() then
      raise exception 'forbidden';
    end if;
  end if;

  insert into public.leaderboard_entries (leaderboard_id, user_id, score, metadata, achieved_at)
  values (p_leaderboard_id, p_user_id, p_score, p_metadata, now())
  on conflict (leaderboard_id, user_id)
  do update set
    score = greatest(leaderboard_entries.score, p_score),
    metadata = p_metadata,
    achieved_at = now()
  where leaderboard_entries.score < p_score;

  -- Recalculate ranks for this leaderboard
  perform public.recalculate_leaderboard_ranks(p_leaderboard_id);
end $$;

-- Function to recalculate ranks for a leaderboard
create or replace function public.recalculate_leaderboard_ranks(p_leaderboard_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rank_rec record;
  current_rank int := 0;
  prev_score int := null;
begin
  for rank_rec in
    select id, score
    from public.leaderboard_entries
    where leaderboard_id = p_leaderboard_id
    order by score desc, achieved_at asc
  loop
    if prev_score is null or rank_rec.score <> prev_score then
      current_rank := current_rank + 1;
    end if;
    update public.leaderboard_entries set rank = current_rank where id = rank_rec.id;
    prev_score := rank_rec.score;
  end loop;
end $$;

-- RLS for leaderboards
alter table public.leaderboards enable row level security;
create policy leaderboards_read on public.leaderboards for select using (true);
create policy leaderboards_admin on public.leaderboards for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.leaderboard_entries enable row level security;
create policy leaderboard_entries_read on public.leaderboard_entries for select using (true);
create policy leaderboard_entries_admin on public.leaderboard_entries for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- migrations/0009_tournaments.sql
-- ===================================================================
-- Tournaments system
create type public.tournament_status as enum ('upcoming', 'registration', 'in_progress', 'completed', 'cancelled');
create type public.tournament_format as enum ('single_elimination', 'double_elimination', 'round_robin', 'swiss');

create table public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.games(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 100),
  description     text check (char_length(description) <= 1000),
  format          public.tournament_format not null default 'single_elimination',
  max_players     int not null check (max_players between 2 and 256),
  status          public.tournament_status not null default 'upcoming',
  registration_starts_at timestamptz,
  registration_ends_at timestamptz,
  starts_at       timestamptz,
  ends_at         timestamptz,
  prize_coins     int not null default 0 check (prize_coins >= 0),
  entry_fee_coins int not null default 0 check (entry_fee_coins >= 0),
  rules           text check (char_length(rules) <= 2000),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tournaments_game_idx on public.tournaments(game_id);
create index tournaments_status_idx on public.tournaments(status);
create index tournaments_starts_idx on public.tournaments(starts_at);
create trigger tournaments_updated before update on public.tournaments
  for each row execute function public.set_updated_at();

-- Tournament registrations
create table public.tournament_registrations (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  registered_at timestamptz not null default now(),
  status        text not null default 'registered', -- registered, withdrawn, disqualified
  unique (tournament_id, user_id)
);
create index tournament_registrations_tournament_idx on public.tournament_registrations(tournament_id);
create index tournament_registrations_user_idx on public.tournament_registrations(user_id);

-- Tournament matches
create table public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         int not null,
  match_number  int not null,
  player1_id   uuid references public.profiles(id) on delete set null,
  player2_id   uuid references public.profiles(id) on delete set null,
  winner_id     uuid references public.profiles(id) on delete set null,
  score1        int,
  score2        int,
  status        text not null default 'scheduled', -- scheduled, in_progress, completed
  scheduled_at  timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  metadata      jsonb
);
create index tournament_matches_tournament_idx on public.tournament_matches(tournament_id);
create index tournament_matches_round_idx on public.tournament_matches(tournament_id, round);
create index tournament_matches_player_idx on public.tournament_matches(player1_id);
create index tournament_matches_player2_idx on public.tournament_matches(player2_id);

-- Bracket positions for single/double elimination
create table public.tournament_brackets (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         int not null,
  position      int not null,
  match_id      uuid references public.tournament_matches(id) on delete set null,
  player_id     uuid references public.profiles(id) on delete set null,
  unique (tournament_id, round, position)
);
create index tournament_brackets_tournament_idx on public.tournament_brackets(tournament_id);

-- Function to register for tournament
create or replace function public.register_for_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tournament public.tournaments;
  v_player_count int;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Get tournament info
  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id;

  if not found then raise exception 'tournament not found'; end if;

  -- Check status
  if v_tournament.status <> 'registration' then
    raise exception 'registration not open';
  end if;

  -- Check time window
  if now() < v_tournament.registration_starts_at or now() > v_tournament.registration_ends_at then
    raise exception 'registration not in time window';
  end if;

  -- Check if already registered
  if exists (select 1 from public.tournament_registrations
             where tournament_id = p_tournament_id and user_id = auth.uid()) then
    raise exception 'already registered';
  end if;

  -- Check max players
  select count(*) into v_player_count
  from public.tournament_registrations
  where tournament_id = p_tournament_id and status = 'registered';

  if v_player_count >= v_tournament.max_players then
    raise exception 'tournament full';
  end if;

  -- Check entry fee
  if v_tournament.entry_fee_coins > 0 then
    -- TODO: Implement coin deduction when rewards system is ready
    raise exception 'coin payment not yet implemented';
  end if;

  -- Register
  insert into public.tournament_registrations (tournament_id, user_id)
  values (p_tournament_id, auth.uid());
end $$;

-- RLS for tournaments
alter table public.tournaments enable row level security;
create policy tournaments_read on public.tournaments for select using (true);
create policy tournaments_admin on public.tournaments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.tournament_registrations enable row level security;
create policy tournament_registrations_read on public.tournament_registrations
  for select using (tournament_id in (select id from public.tournaments where status = 'completed'));
create policy tournament_registrations_user on public.tournament_registrations
  for select using (user_id = auth.uid());
create policy tournament_registrations_admin on public.tournament_registrations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.tournament_matches enable row level security;
create policy tournament_matches_read on public.tournament_matches for select using (true);
create policy tournament_matches_admin on public.tournament_matches for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.tournament_brackets enable row level security;
create policy tournament_brackets_read on public.tournament_brackets for select using (true);
create policy tournament_brackets_admin on public.tournament_brackets for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- migrations/0010_achievements.sql
-- ===================================================================
-- Achievements and badges system
create type public.achievement_type as enum ('score', 'wins', 'games_played', 'streak', 'special');

create table public.achievements (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null check (char_length(name) between 2 and 60),
  description     text not null check (char_length(description) <= 200),
  type            public.achievement_type not null,
  game_id         uuid references public.games(id) on delete set null, -- null for global achievements
  requirement     jsonb not null, -- { score: 1000, wins: 10, etc. }
  reward_coins    int not null default 0 check (reward_coins >= 0),
  reward_badge_id uuid, -- references badges when implemented
  icon            text not null default '🏆',
  is_hidden       boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index achievements_slug_idx on public.achievements(slug);
create index achievements_game_idx on public.achievements(game_id);
create index achievements_type_idx on public.achievements(type);

-- User achievements (earned achievements)
create table public.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_id  uuid not null references public.achievements(id) on delete cascade,
  earned_at       timestamptz not null default now(),
  progress        jsonb not null default '{}'::jsonb, -- track progress toward achievement
  unique (user_id, achievement_id)
);
create index user_achievements_user_idx on public.user_achievements(user_id);
create index user_achievements_achievement_idx on public.user_achievements(achievement_id);
create index user_achievements_earned_idx on public.user_achievements(earned_at desc);

-- Badges (cosmetic rewards)
create table public.badges (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null check (char_length(name) between 2 and 60),
  description     text check (char_length(description) <= 200),
  icon            text not null default '🎖️',
  rarity          text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index badges_slug_idx on public.badges(slug);
create index badges_rarity_idx on public.badges(rarity);

-- User badges (owned badges)
create table public.user_badges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  badge_id        uuid not null references public.badges(id) on delete cascade,
  is_equipped     boolean not null default false,
  obtained_at     timestamptz not null default now(),
  source_type     text, -- achievement, tournament, shop, etc.
  source_id       uuid, -- reference to source
  unique (user_id, badge_id)
);
create index user_badges_user_idx on public.user_badges(user_id);
create index user_badges_equipped_idx on public.user_badges(user_id) where is_equipped = true;

-- Function to check and award achievements
create or replace function public.check_achievement_progress(
  p_user_id uuid,
  p_achievement_id uuid,
  p_progress jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_achievement public.achievements;
  v_earned boolean;
  v_requirement jsonb;
  v_requirement_key text;
  v_requirement_value int;
  v_current_value int;
  v_meets_requirement boolean := true;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;

  -- Get achievement
  select * into v_achievement
  from public.achievements
  where id = p_achievement_id and is_active = true;

  if not found then return false; end if;

  -- Check if already earned
  select exists(select 1) into v_earned
  from public.user_achievements
  where user_id = p_user_id and achievement_id = p_achievement_id;

  if v_earned then return true; end if;

  -- Check requirements
  v_requirement := v_achievement.requirement;

  -- Iterate through requirement keys
  for v_requirement_key in select jsonb_object_keys(v_requirement) loop
    v_requirement_value := (v_requirement ->> v_requirement_key)::int;
    v_current_value := (p_progress ->> v_requirement_key)::int;

    if v_current_value < v_requirement_value then
      v_meets_requirement := false;
      exit;
    end if;
  end loop;

  -- Update or create progress
  insert into public.user_achievements (user_id, achievement_id, progress)
  values (p_user_id, p_achievement_id, p_progress)
  on conflict (user_id, achievement_id)
  do update set progress = p_progress;

  -- Award if meets requirements
  if v_meets_requirement then
    insert into public.user_achievements (user_id, achievement_id, progress)
    values (p_user_id, p_achievement_id, p_progress)
    on conflict (user_id, achievement_id) do nothing;

    -- Award badge if linked
    if v_achievement.reward_badge_id is not null then
      insert into public.user_badges (user_id, badge_id, source_type, source_id)
      values (p_user_id, v_achievement.reward_badge_id, 'achievement', p_achievement_id)
      on conflict (user_id, badge_id) do nothing;
    end if;

    -- Award coins
    if v_achievement.reward_coins > 0 then
      -- TODO: Implement coin addition when rewards system is ready
      null;
    end if;

    return true;
  end if;

  return false;
end $$;

-- RLS for achievements
alter table public.achievements enable row level security;
create policy achievements_read on public.achievements for select using (is_active = true);
create policy achievements_admin on public.achievements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_achievements enable row level security;
create policy user_achievements_read on public.user_achievements
  for select using (user_id = auth.uid());
create policy user_achievements_admin on public.user_achievements for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.badges enable row level security;
create policy badges_read on public.badges for select using (is_active = true);
create policy badges_admin on public.badges for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_badges enable row level security;
create policy user_badges_read on public.user_badges
  for select using (user_id = auth.uid());
create policy user_badges_admin on public.user_badges for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- migrations/0011_chat.sql
-- ===================================================================
-- Chat system with moderation
create type public.chat_room_type as enum ('global', 'game', 'tournament', 'direct');

create table public.chat_rooms (
  id              uuid primary key default gen_random_uuid(),
  type            public.chat_room_type not null,
  name            text not null check (char_length(name) between 2 and 60),
  description     text check (char_length(description) <= 200),
  game_id         uuid references public.games(id) on delete cascade,
  tournament_id   uuid references public.tournaments(id) on delete cascade,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index chat_rooms_type_idx on public.chat_rooms(type);
create index chat_rooms_game_idx on public.chat_rooms(game_id);
create index chat_rooms_tournament_idx on public.chat_rooms(tournament_id);

-- Chat room participants
create table public.chat_participants (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.chat_rooms(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  is_muted        boolean not null default false,
  muted_until     timestamptz,
  unique (room_id, user_id)
);
create index chat_participants_room_idx on public.chat_participants(room_id);
create index chat_participants_user_idx on public.chat_participants(user_id);
create index chat_participants_muted_idx on public.chat_participants(user_id, muted_until) where is_muted = true;

-- Chat messages
create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.chat_rooms(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 500),
  is_deleted      boolean not null default false,
  is_flagged      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages(room_id, created_at desc);
create index chat_messages_user_idx on public.chat_messages(user_id);
create index chat_messages_flagged_idx on public.chat_messages(room_id, created_at) where is_flagged = true;

-- Direct message conversations (for private chats)
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user1_id        uuid not null references public.profiles(id) on delete cascade,
  user2_id        uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  check (user1_id < user2_id),
  unique (user1_id, user2_id)
);
create index conversations_user1_idx on public.conversations(user1_id);
create index conversations_user2_idx on public.conversations(user2_id);

-- Direct messages
create table public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 500),
  is_deleted      boolean not null default false,
  is_flagged      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index direct_messages_conversation_idx on public.direct_messages(conversation_id, created_at desc);
create index direct_messages_sender_idx on public.direct_messages(sender_id);
create index direct_messages_flagged_idx on public.direct_messages (is_flagged) where is_flagged = true;

-- User block list
create table public.user_blocks (
  id              uuid primary key default gen_random_uuid(),
  blocker_id      uuid not null references public.profiles(id) on delete cascade,
  blocked_id      uuid not null references public.profiles(id) on delete cascade,
  blocked_at      timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
create index user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index user_blocks_blocked_idx on public.user_blocks(blocked_id);

-- Profanity filter word list
create table public.profanity_words (
  id              serial primary key,
  word            text not null unique,
  severity        text not null default 'medium' check (severity in ('mild', 'medium', 'severe'))
);

-- Function to check for profanity
create or replace function public.contains_profanity(p_text text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profanity_words
    where lower(p_text) ~* ('\\b' || word || '\\b')
  );
$$;

-- Function to send chat message
create or replace function public.send_chat_message(
  p_room_id uuid,
  p_content text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_message_id uuid;
  v_is_muted boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Check if muted
  select is_muted into v_is_muted
  from public.chat_participants
  where room_id = p_room_id and user_id = auth.uid();

  if v_is_muted = true then
    raise exception 'you are muted in this room';
  end if;

  -- Check for profanity
  if public.contains_profanity(p_content) then
    raise exception 'message contains inappropriate language';
  end if;

  -- Send message
  insert into public.chat_messages (room_id, user_id, content)
  values (p_room_id, auth.uid(), p_content)
  returning id into v_message_id;

  return v_message_id;
end $$;

-- Function to send direct message
create or replace function public.send_direct_message(
  p_recipient_id uuid,
  p_content text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_is_blocked boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Check if blocked
  select exists(select 1) into v_is_blocked
  from public.user_blocks
  where (blocker_id = p_recipient_id and blocked_id = auth.uid())
     or (blocker_id = auth.uid() and blocked_id = p_recipient_id);

  if v_is_blocked then
    raise exception 'cannot send message to blocked user';
  end if;

  -- Check for profanity
  if public.contains_profanity(p_content) then
    raise exception 'message contains inappropriate language';
  end if;

  -- Get or create conversation
  select id into v_conversation_id
  from public.conversations
  where user1_id = least(auth.uid(), p_recipient_id)
    and user2_id = greatest(auth.uid(), p_recipient_id);

  if not found then
    insert into public.conversations (user1_id, user2_id)
    values (least(auth.uid(), p_recipient_id), greatest(auth.uid(), p_recipient_id))
    returning id into v_conversation_id;
  end if;

  -- Send message
  insert into public.direct_messages (conversation_id, sender_id, content)
  values (v_conversation_id, auth.uid(), p_content)
  returning id into v_message_id;

  return v_message_id;
end $$;

-- RLS for chat
alter table public.chat_rooms enable row level security;
create policy chat_rooms_read on public.chat_rooms for select using (is_active = true);
create policy chat_rooms_admin on public.chat_rooms for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.chat_participants enable row level security;
create policy chat_participants_read on public.chat_participants
  for select using (user_id = auth.uid());
create policy chat_participants_admin on public.chat_participants for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.chat_messages enable row level security;
create policy chat_messages_read on public.chat_messages
  for select using (room_id in (select room_id from public.chat_participants where user_id = auth.uid()));
create policy chat_messages_admin on public.chat_messages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.conversations enable row level security;
create policy conversations_read on public.conversations
  for select using (user1_id = auth.uid() or user2_id = auth.uid());
create policy conversations_admin on public.conversations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.direct_messages enable row level security;
create policy direct_messages_read on public.direct_messages
  for select using (conversation_id in (
    select id from public.conversations where user1_id = auth.uid() or user2_id = auth.uid()
  ));
create policy direct_messages_admin on public.direct_messages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_blocks enable row level security;
create policy user_blocks_read on public.user_blocks
  for select using (blocker_id = auth.uid());
create policy user_blocks_write on public.user_blocks for insert
  with check (blocker_id = auth.uid());
create policy user_blocks_delete on public.user_blocks for delete
  using (blocker_id = auth.uid());

-- ===================================================================
-- migrations/0012_rewards.sql
-- ===================================================================
-- Rewards system (coins, cosmetics, avatars) - NON-GAMBLING
create table public.user_coins (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  balance         int not null default 0 check (balance >= 0),
  total_earned    int not null default 0,
  total_spent     int not null default 0,
  updated_at      timestamptz not null default now()
);
create index user_coins_user_idx on public.user_coins(user_id);

-- Coin transactions (audit trail)
create table public.coin_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          int not null, -- positive for earning, negative for spending
  type            text not null, -- achievement, tournament, daily_bonus, purchase, etc.
  description     text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index coin_transactions_user_idx on public.coin_transactions(user_id, created_at desc);
create index coin_transactions_type_idx on public.coin_transactions(type);

-- Cosmetic items (avatars, frames, themes, etc.)
create type public.cosmetic_type as enum ('avatar', 'frame', 'theme', 'title', 'effect');

create table public.cosmetics (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null check (char_length(name) between 2 and 60),
  description     text check (char_length(description) <= 200),
  type            public.cosmetic_type not null,
  icon            text not null default '✨',
  price_coins     int not null default 0 check (price_coins >= 0),
  rarity          text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  is_limited      boolean not null default false,
  is_active       boolean not null default true,
  available_from  timestamptz,
  available_until timestamptz,
  created_at      timestamptz not null default now()
);
create index cosmetics_slug_idx on public.cosmetics(slug);
create index cosmetics_type_idx on public.cosmetics(type);
create index cosmetics_rarity_idx on public.cosmetics(rarity);

-- User cosmetics (owned items)
create table public.user_cosmetics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id     uuid not null references public.cosmetics(id) on delete cascade,
  is_equipped     boolean not null default false,
  obtained_at     timestamptz not null default now(),
  source_type     text, -- purchase, achievement, tournament, gift, etc.
  source_id       uuid,
  unique (user_id, cosmetic_id)
);
create index user_cosmetics_user_idx on public.user_cosmetics(user_id);
create index user_cosmetics_equipped_idx on public.user_cosmetics(user_id) where is_equipped = true;

-- Daily login bonuses
create table public.daily_login_rewards (
  id              uuid primary key default gen_random_uuid(),
  day_number      int not null unique check (day_number between 1 and 30),
  coins           int not null default 0 check (coins >= 0),
  cosmetic_id     uuid references public.cosmetics(id) on delete set null,
  is_active       boolean not null default true
);
create index daily_login_rewards_day_idx on public.daily_login_rewards(day_number);

-- User daily login streaks
create table public.user_login_streaks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  current_streak  int not null default 0,
  longest_streak  int not null default 0,
  last_login_date date,
  total_logins    int not null default 0,
  updated_at      timestamptz not null default now()
);
create index user_login_streaks_user_idx on public.user_login_streaks(user_id);

-- Function to add coins
create or replace function public.add_coins(
  p_user_id uuid,
  p_amount int,
  p_type text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Update balance
  insert into public.user_coins (user_id, balance, total_earned)
  values (p_user_id, p_amount, p_amount)
  on conflict (user_id)
  do update set
    balance = user_coins.balance + p_amount,
    total_earned = user_coins.total_earned + p_amount,
    updated_at = now();

  -- Record transaction
  insert into public.coin_transactions (user_id, amount, type, description, metadata)
  values (p_user_id, p_amount, p_type, p_description, p_metadata);
end $$;

-- Function to spend coins
create or replace function public.spend_coins(
  p_user_id uuid,
  p_amount int,
  p_type text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_current_balance int;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Check balance
  select balance into v_current_balance
  from public.user_coins
  where user_id = p_user_id;

  if v_current_balance is null or v_current_balance < p_amount then
    return false; -- Insufficient funds
  end if;

  -- Update balance
  update public.user_coins
  set
    balance = balance - p_amount,
    total_spent = total_spent + p_amount,
    updated_at = now()
  where user_id = p_user_id;

  -- Record transaction
  insert into public.coin_transactions (user_id, amount, type, description, metadata)
  values (p_user_id, -p_amount, p_type, p_description, p_metadata);

  return true;
end $$;

-- Function to purchase cosmetic
create or replace function public.purchase_cosmetic(p_cosmetic_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_cosmetic public.cosmetics;
  v_already_owned boolean;
  v_purchased boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Get cosmetic
  select * into v_cosmetic
  from public.cosmetics
  where id = p_cosmetic_id and is_active = true;

  if not found then raise exception 'cosmetic not found'; end if;

  -- Check availability
  if v_cosmetic.is_limited then
    if v_cosmetic.available_from is not null and now() < v_cosmetic.available_from then
      raise exception 'cosmetic not yet available';
    end if;
    if v_cosmetic.available_until is not null and now() > v_cosmetic.available_until then
      raise exception 'cosmetic no longer available';
    end if;
  end if;

  -- Check if already owned
  select exists(select 1) into v_already_owned
  from public.user_cosmetics
  where user_id = auth.uid() and cosmetic_id = p_cosmetic_id;

  if v_already_owned then raise exception 'already owned'; end if;

  -- Attempt to spend coins
  v_purchased := public.spend_coins(
    auth.uid(),
    v_cosmetic.price_coins,
    'purchase',
    'Purchased: ' || v_cosmetic.name,
    jsonb_build_object('cosmetic_id', p_cosmetic_id)
  );

  if not v_purchased then raise exception 'insufficient coins'; end if;

  -- Add to user cosmetics
  insert into public.user_cosmetics (user_id, cosmetic_id, source_type, source_id)
  values (auth.uid(), p_cosmetic_id, 'purchase', p_cosmetic_id);

  return true;
end $$;

-- Function to equip cosmetic
create or replace function public.equip_cosmetic(p_cosmetic_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cosmetic public.cosmetics;
  v_cosmetic_type public.cosmetic_type;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;

  -- Get cosmetic
  select * into v_cosmetic
  from public.cosmetics
  where id = p_cosmetic_id;

  if not found then raise exception 'cosmetic not found'; end if;

  -- Check ownership
  if not exists (
    select 1 from public.user_cosmetics
    where user_id = auth.uid() and cosmetic_id = p_cosmetic_id
  ) then
    raise exception 'do not own this cosmetic';
  end if;

  v_cosmetic_type := v_cosmetic.type;

  -- Unequip other cosmetics of same type
  update public.user_cosmetics
  set is_equipped = false
  where user_id = auth.uid()
    and cosmetic_id in (select id from public.cosmetics where type = v_cosmetic_type);

  -- Equip this cosmetic
  update public.user_cosmetics
  set is_equipped = true
  where user_id = auth.uid() and cosmetic_id = p_cosmetic_id;
end $$;

-- Function to process daily login
create or replace function public.process_daily_login() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_streak public.user_login_streaks;
  v_day_number int;
  v_reward public.daily_login_rewards;
  v_coins_awarded int := 0;
  v_today date := current_date;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;

  -- Get or create streak record
  select * into v_streak
  from public.user_login_streaks
  where user_id = auth.uid();

  if not found then
    insert into public.user_login_streaks (user_id, current_streak, longest_streak, last_login_date, total_logins)
    values (auth.uid(), 1, 1, v_today, 1)
    returning * into v_streak;
  else
    -- Check if already logged in today
    if v_streak.last_login_date = v_today then
      return 0; -- Already claimed today
    end if;

    -- Check if streak is broken (missed a day)
    if v_streak.last_login_date < v_today - interval '1 day' then
      -- Reset streak
      update public.user_login_streaks
      set current_streak = 1, last_login_date = v_today, total_logins = total_logins + 1
      where user_id = auth.uid()
      returning * into v_streak;
    else
      -- Continue streak
      update public.user_login_streaks
      set
        current_streak = current_streak + 1,
        longest_streak = greatest(longest_streak, current_streak + 1),
        last_login_date = v_today,
        total_logins = total_logins + 1
      where user_id = auth.uid()
      returning * into v_streak;
    end if;
  end if;

  -- Determine reward (caps at day 30)
  v_day_number := least(v_streak.current_streak, 30);

  -- Get reward
  select * into v_reward
  from public.daily_login_rewards
  where day_number = v_day_number and is_active = true;

  if v_reward.found then
    -- Award coins
    if v_reward.coins > 0 then
      perform public.add_coins(
        auth.uid(),
        v_reward.coins,
        'daily_login',
        'Day ' || v_day_number || ' login bonus'
      );
      v_coins_awarded := v_reward.coins;
    end if;

    -- Award cosmetic if applicable
    if v_reward.cosmetic_id is not null then
      insert into public.user_cosmetics (user_id, cosmetic_id, source_type, source_id)
      values (auth.uid(), v_reward.cosmetic_id, 'daily_login', v_streak.id)
      on conflict (user_id, cosmetic_id) do nothing;
    end if;
  end if;

  return v_coins_awarded;
end $$;

-- RLS for rewards
alter table public.user_coins enable row level security;
create policy user_coins_read on public.user_coins
  for select using (user_id = auth.uid());
create policy user_coins_admin on public.user_coins for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.coin_transactions enable row level security;
create policy coin_transactions_read on public.coin_transactions
  for select using (user_id = auth.uid());
create policy coin_transactions_admin on public.coin_transactions for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.cosmetics enable row level security;
create policy cosmetics_read on public.cosmetics for select using (is_active = true);
create policy cosmetics_admin on public.cosmetics for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_cosmetics enable row level security;
create policy user_cosmetics_read on public.user_cosmetics
  for select using (user_id = auth.uid());
create policy user_cosmetics_admin on public.user_cosmetics for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.daily_login_rewards enable row level security;
create policy daily_login_rewards_read on public.daily_login_rewards for select using (is_active = true);
create policy daily_login_rewards_admin on public.daily_login_rewards for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_login_streaks enable row level security;
create policy user_login_streaks_read on public.user_login_streaks
  for select using (user_id = auth.uid());
create policy user_login_streaks_admin on public.user_login_streaks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- migrations/0013_dice.sql
-- ===================================================================
-- Dice: a built-in game for 2-8 players, so rooms may now hold up to 8 players
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.game_rooms'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%max_players%'
  loop
    execute format('alter table public.game_rooms drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.game_rooms
  add constraint game_rooms_max_players_check check (max_players between 2 and 8);

insert into public.games (slug,name,description,icon,thumbnail_url,category_id,min_players,max_players,modes,status,is_builtin,coming_soon,sort_order,published_at)
select 'dice','Dice','Roll two dice and race to the target score. Doubles score double! Play online with up to 8 friends.','🎲',null,c.id,2,8,'{single,multi}','published',true,false,9,now()
from public.categories c where c.slug = 'board'
on conflict (slug) do update set
  min_players = excluded.min_players, max_players = excluded.max_players, modes = excluded.modes,
  status = excluded.status, coming_soon = excluded.coming_soon, is_builtin = true;

-- ===================================================================
-- migrations/0014_snake_and_ladder_six_players.sql
-- ===================================================================
-- Snake & Ladder: new board with six coloured rings, so 2-6 players
update public.games
set max_players = 6,
    description = 'Throw the red dice and race your coloured ring to square 100. Climb ladders, dodge snakes! 2-6 players.'
where slug = 'snake-and-ladder';

-- ===================================================================
-- migrations/0015_release_phase2_games.sql
-- ===================================================================
-- Phase 2 game releases: Checkers, Chess, Word Search, Scrabble and
-- SierraPoly are now implemented and playable. UNO stays coming_soon.
update public.games
set coming_soon = false,
    status = 'published',
    published_at = coalesce(published_at, now())
where slug in ('checkers', 'chess', 'word-search', 'scrabble', 'monopoly');

update public.games
set coming_soon = true
where slug = 'uno';

-- ===================================================================
-- migrations/0016_remove_sierrapoly.sql
-- ===================================================================
-- Remove SierraPoly from the catalog (game files kept for a possible future re-release)
delete from public.games where slug = 'monopoly';

-- ===================================================================
-- seed.sql
-- ===================================================================
insert into public.districts (name) values
 ('Western Area Urban'),('Western Area Rural'),('Port Loko'),('Kambia'),('Karene'),('Bombali'),('Falaba'),
 ('Koinadugu'),('Tonkolili'),('Kono'),('Kailahun'),('Kenema'),('Bo'),('Bonthe'),('Moyamba'),('Pujehun')
on conflict (name) do nothing;

insert into public.categories (slug, name, sort_order) values
 ('arcade','Arcade',1),('board','Board',2),('card','Card',3),('word','Word',4),('puzzle','Puzzle',5)
on conflict (slug) do nothing;

-- The 8 planned games. Snake, Snake & Ladder, Checkers, Chess, Word Search
-- and Scrabble are implemented (coming_soon = false). UNO is not developed
-- yet and stays coming_soon = true.
insert into public.games (slug,name,description,icon,thumbnail_url,category_id,min_players,max_players,modes,status,coming_soon,sort_order,published_at)
select v.slug, v.name, v.descr, v.icon, v.thumbnail, c.id, v.minp, v.maxp, v.modes::public.game_mode[], 'published', v.coming_soon, v.ord, now()
from (values
 ('snake','Snake','Guide the snake, eat, grow, and avoid crashing.','🐍','https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop','arcade',1,1,'{single}',1,false),
 ('snake-and-ladder','Snake & Ladder','Roll the dice and race to square 100.','🎲','https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400&h=400&fit=crop','board',2,4,'{single,multi}',2,false),
 ('checkers','Checkers','Jump and capture all your opponent''s pieces.','🔴','https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=400&h=400&fit=crop','board',2,2,'{single,multi}',3,false),
 ('chess','Chess','The classic game of strategy.','♟️','https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?w=400&h=400&fit=crop','board',2,2,'{single,multi}',4,false),
 ('word-search','Word Search','Find the hidden words in the grid.','🔤','https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=400&fit=crop','word',1,1,'{single}',5,false),
 ('scrabble','Scrabble','Build words on the board and score big.','🔠','https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=400&fit=crop','word',2,4,'{single,multi}',6,false),
 ('uno','UNO','Match colours and numbers. Be first to empty your hand.','🃏','https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=400&h=400&fit=crop','card',2,4,'{single,multi}',7,true),
 ('dice','Dice','Roll two dice and race to the target score. Doubles score double! Play online with up to 8 friends.','🎲',null,'board',2,8,'{single,multi}',9,false)
) as v(slug,name,descr,icon,thumbnail,cat,minp,maxp,modes,ord,coming_soon)
join public.categories c on c.slug = v.cat
on conflict (slug) do update set coming_soon = excluded.coming_soon;
