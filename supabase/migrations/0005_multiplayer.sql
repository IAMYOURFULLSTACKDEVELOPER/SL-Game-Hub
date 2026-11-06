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
