insert into public.districts (name) values
 ('Western Area Urban'),('Western Area Rural'),('Port Loko'),('Kambia'),('Karene'),('Bombali'),('Falaba'),
 ('Koinadugu'),('Tonkolili'),('Kono'),('Kailahun'),('Kenema'),('Bo'),('Bonthe'),('Moyamba'),('Pujehun')
on conflict (name) do nothing;

insert into public.categories (slug, name, sort_order) values
 ('arcade','Arcade',1),('board','Board',2),('card','Card',3),('word','Word',4),('puzzle','Puzzle',5)
on conflict (slug) do nothing;

-- The 8 planned games. coming_soon = true until Phase 2 builds each one.
-- Snake and Snake & Ladder are now implemented (coming_soon = false)
insert into public.games (slug,name,description,icon,thumbnail_url,category_id,min_players,max_players,modes,status,coming_soon,sort_order,published_at)
select v.slug, v.name, v.descr, v.icon, v.thumbnail, c.id, v.minp, v.maxp, v.modes::public.game_mode[], 'published', v.coming_soon, v.ord, now()
from (values
 ('snake','Snake','Guide the snake, eat, grow, and avoid crashing.','🐍','https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop','arcade',1,1,'{single}',1,false),
 ('snake-and-ladder','Snake & Ladder','Roll the dice and race to square 100.','🎲','https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400&h=400&fit=crop','board',2,4,'{single,multi}',2,false),
 ('checkers','Checkers','Jump and capture all your opponent''s pieces.','🔴','https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=400&h=400&fit=crop','board',2,2,'{single,multi}',3,true),
 ('chess','Chess','The classic game of strategy.','♟️','https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?w=400&h=400&fit=crop','board',2,2,'{single,multi}',4,true),
 ('word-search','Word Search','Find the hidden words in the grid.','🔤','https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=400&fit=crop','word',1,1,'{single}',5,true),
 ('scrabble','Scrabble','Build words on the board and score big.','🔠','https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400&h=400&fit=crop','word',2,4,'{single,multi}',6,true),
 ('uno','UNO','Match colours and numbers. Be first to empty your hand.','🃏','https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=400&h=400&fit=crop','card',2,4,'{single,multi}',7,true),
 ('monopoly','SierraPoly','A property-trading board game inspired by Sierra Leone locations, institutions, businesses, utilities and transportation systems.','🏠','https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=400&fit=crop','board',2,8,'{single,multi}',8,true),
 ('dice','Dice','Roll two dice and race to the target score. Doubles score double! Play online with up to 8 friends.','🎲',null,'board',2,8,'{single,multi}',9,false)
) as v(slug,name,descr,icon,thumbnail,cat,minp,maxp,modes,ord,coming_soon)
join public.categories c on c.slug = v.cat
on conflict (slug) do nothing;
