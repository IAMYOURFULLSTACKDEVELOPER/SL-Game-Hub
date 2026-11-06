-- Buckets. (Avatars are preset emoji ids in Phase 1, so no avatar bucket is needed yet.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('game-thumbnails', 'game-thumbnails', true,  524288,   array['image/webp','image/png','image/jpeg']),
  ('game-bundles',    'game-bundles',    false, 10485760, array['application/zip'])
on conflict (id) do nothing;

create policy thumbs_read  on storage.objects for select using (bucket_id = 'game-thumbnails');
create policy thumbs_admin on storage.objects for all to authenticated
  using (bucket_id = 'game-thumbnails' and public.is_admin())
  with check (bucket_id = 'game-thumbnails' and public.is_admin());
create policy bundles_admin on storage.objects for all to authenticated
  using (bucket_id = 'game-bundles' and public.is_admin())
  with check (bucket_id = 'game-bundles' and public.is_admin());
