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
