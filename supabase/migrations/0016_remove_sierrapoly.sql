-- Remove SierraPoly from the catalog (game files kept for a possible future re-release)
delete from public.games where slug = 'monopoly';
