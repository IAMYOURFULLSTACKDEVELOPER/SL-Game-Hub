-- Snake & Ladder: new board with six coloured rings, so 2-6 players
update public.games
set max_players = 6,
    description = 'Throw the red dice and race your coloured ring to square 100. Climb ladders, dodge snakes! 2-6 players.'
where slug = 'snake-and-ladder';
