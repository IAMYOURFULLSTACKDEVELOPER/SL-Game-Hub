-- Phase 2 game releases: Checkers, Chess, Word Search, Scrabble and
-- SierraPoly are now implemented and playable. UNO stays coming_soon.
update public.games
set coming_soon = false,
    status = 'published',
    published_at = coalesce(published_at, now())
where slug in ('checkers', 'chess', 'word-search', 'scrabble', 'monopoly');

update public.games
set coming_soon = true
where slug = 'uno';
