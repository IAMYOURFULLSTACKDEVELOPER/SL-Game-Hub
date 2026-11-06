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
