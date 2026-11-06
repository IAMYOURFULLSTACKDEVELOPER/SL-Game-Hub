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
