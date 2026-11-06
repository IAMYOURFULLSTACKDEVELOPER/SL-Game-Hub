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
