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
