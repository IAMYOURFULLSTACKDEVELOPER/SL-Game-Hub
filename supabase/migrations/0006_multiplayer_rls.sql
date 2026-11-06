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
