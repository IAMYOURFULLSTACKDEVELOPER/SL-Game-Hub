-- Mark Snake and Snake & Ladder as published (no longer coming_soon)
update public.games
set coming_soon = false
where slug in ('snake', 'snake-and-ladder');
