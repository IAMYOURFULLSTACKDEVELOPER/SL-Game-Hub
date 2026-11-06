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
