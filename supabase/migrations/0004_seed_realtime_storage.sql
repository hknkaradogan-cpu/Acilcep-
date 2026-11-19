-- =====================================================================
-- ACİLCEP – 0004: Categories, Realtime, Storage (photos)
-- =====================================================================

-- ---------- Categories (reference data, not demo data) ----------
insert into public.categories (slug, name_en, name_tr, icon, sort) values
  ('hotel-linen',      'Hotel linen & towels',        'Otel tekstili & havlu',       '🛏️', 10),
  ('cleaning',         'Cleaning & hygiene',          'Temizlik & hijyen',           '🧴', 20),
  ('food',             'Food & ingredients',          'Gıda & malzeme',              '🥕', 30),
  ('beverages',        'Coffee, milk & beverages',    'Kahve, süt & içecek',         '☕', 40),
  ('packaging',        'Packaging & disposables',     'Ambalaj & sarf malzemesi',    '📦', 50),
  ('kitchen',          'Kitchen equipment',           'Mutfak ekipmanı',             '🍳', 60),
  ('technical',        'Technical supplies',          'Teknik malzeme',              '🔧', 70),
  ('spare-parts',      'Spare parts',                 'Yedek parça',                 '⚙️', 80),
  ('electrical',       'Electrical & lighting',       'Elektrik & aydınlatma',       '💡', 90),
  ('office',           'Office supplies',             'Ofis malzemesi',              '🖨️', 100),
  ('medical',          'First aid & safety',          'İlk yardım & güvenlik',       '🩹', 110),
  ('services',         'Urgent services',             'Acil hizmetler',              '🚚', 120),
  ('other',            'Other',                       'Diğer',                       '🗂️', 999)
on conflict (slug) do update
  set name_en = excluded.name_en, name_tr = excluded.name_tr, icon = excluded.icon, sort = excluded.sort;

-- ---------- Realtime ----------
-- Supabase Realtime delivers row changes only to users allowed by RLS.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['requests', 'offers', 'orders', 'order_events', 'messages', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Storage bucket for request photos ----------
-- Files must be stored as "<user id>/<file name>". Max 5 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-photos', 'request-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "request photos upload own folder" on storage.objects;
create policy "request photos upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() = 'buyer'
  );

drop policy if exists "request photos delete own" on storage.objects;
create policy "request photos delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'request-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "request photos read" on storage.objects;
create policy "request photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'request-photos');
