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
