-- =====================================================================
-- ACİLCEP – Emergency Supply Network
-- 0001: Tables, types, indexes
-- Run order: 0001 -> 0002 -> 0003 -> 0004 (or just run supabase/setup.sql)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
do $$ begin
  create type public.user_role as enum ('buyer', 'supplier', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('open', 'awarded', 'cancelled', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- Supplier plans. Payments are NOT integrated: plans are informational (demo) only.
do $$ begin
  create type public.supplier_plan as enum ('trial', 'basic', 'pro');
exception when duplicate_object then null; end $$;

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  role           public.user_role not null default 'buyer',
  full_name      text not null default '' check (char_length(full_name) <= 120),
  company_name   text not null default '' check (char_length(company_name) <= 160),
  phone          text check (char_length(phone) <= 40),
  country        text check (country ~ '^[A-Z]{2}$'),
  city           text check (char_length(city) <= 100),
  address        text check (char_length(address) <= 300),
  bio            text check (char_length(bio) <= 1000),
  website        text check (char_length(website) <= 200),
  category_ids   int[] not null default '{}',
  currency       text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  language       text not null default 'en' check (language in ('en', 'tr')),
  plan           public.supplier_plan,
  trial_ends_at  timestamptz,
  is_demo        boolean not null default false,
  is_suspended   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- Categories ----------
create table if not exists public.categories (
  id       serial primary key,
  slug     text not null unique,
  name_en  text not null,
  name_tr  text not null,
  icon     text not null default '📦',
  sort     int not null default 0
);

-- ---------- Supplier products / services ----------
create table if not exists public.supplier_products (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.profiles (id) on delete cascade,
  category_id  int references public.categories (id),
  name         text not null check (char_length(name) between 2 and 120),
  description  text check (char_length(description) <= 1000),
  price        numeric(12, 2) check (price is null or price >= 0),
  currency     text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  unit         text check (char_length(unit) <= 30),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- Emergency requests (needs) ----------
create table if not exists public.requests (
  id                   uuid primary key default gen_random_uuid(),
  buyer_id             uuid not null references public.profiles (id) on delete cascade,
  category_id          int not null references public.categories (id),
  title                text not null check (char_length(title) between 3 and 140),
  description          text check (char_length(description) <= 2000),
  quantity             numeric(12, 2) not null check (quantity > 0),
  unit                 text not null default 'pcs' check (char_length(unit) between 1 and 30),
  photo_path           text check (char_length(photo_path) <= 300),
  country              text not null check (country ~ '^[A-Z]{2}$'),
  city                 text not null check (char_length(city) between 1 and 100),
  delivery_address     text not null check (char_length(delivery_address) between 3 and 300),
  needed_within_hours  int not null default 24 check (needed_within_hours between 1 and 720),
  currency             text not null check (currency ~ '^[A-Z]{3}$'),
  budget               numeric(12, 2) check (budget is null or budget > 0),
  status               public.request_status not null default 'open',
  is_featured          boolean not null default false,
  is_demo              boolean not null default false,
  accepted_offer_id    uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- Offers ----------
create table if not exists public.offers (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references public.requests (id) on delete cascade,
  supplier_id       uuid not null references public.profiles (id) on delete cascade,
  price             numeric(12, 2) not null check (price > 0),
  currency          text not null check (currency ~ '^[A-Z]{3}$'),
  delivery_minutes  int not null check (delivery_minutes between 5 and 43200),
  note              text check (char_length(note) <= 1000),
  status            public.offer_status not null default 'pending',
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (request_id, supplier_id)
);

do $$ begin
  alter table public.requests
    add constraint requests_accepted_offer_fk
    foreign key (accepted_offer_id) references public.offers (id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- Orders ----------
create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null unique references public.requests (id) on delete cascade,
  offer_id     uuid not null unique references public.offers (id) on delete cascade,
  buyer_id     uuid not null references public.profiles (id) on delete cascade,
  supplier_id  uuid not null references public.profiles (id) on delete cascade,
  price        numeric(12, 2) not null,
  currency     text not null,
  status       public.order_status not null default 'confirmed',
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.order_events (
  id          bigserial primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  status      public.order_status not null,
  actor_id    uuid references public.profiles (id) on delete set null,
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now()
);

-- ---------- Messages (between buyer and a supplier, scoped to a request) ----------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests (id) on delete cascade,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  read_at       timestamptz,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

-- ---------- Notifications ----------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  data        jsonb not null default '{}'::jsonb,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- Reviews (supplier rating) ----------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders (id) on delete cascade,
  buyer_id     uuid not null references public.profiles (id) on delete cascade,
  supplier_id  uuid not null references public.profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- Reports / complaints ----------
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('user', 'request', 'offer', 'message', 'order')),
  target_id    uuid not null,
  reason       text not null check (char_length(reason) between 3 and 1000),
  status       public.report_status not null default 'open',
  admin_note   text check (char_length(admin_note) <= 1000),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------- Indexes ----------
create index if not exists requests_status_idx      on public.requests (status, created_at desc);
create index if not exists requests_buyer_idx       on public.requests (buyer_id, created_at desc);
create index if not exists requests_category_idx    on public.requests (category_id);
create index if not exists offers_request_idx       on public.offers (request_id);
create index if not exists offers_supplier_idx      on public.offers (supplier_id, created_at desc);
create index if not exists orders_buyer_idx         on public.orders (buyer_id, created_at desc);
create index if not exists orders_supplier_idx      on public.orders (supplier_id, created_at desc);
create index if not exists order_events_order_idx   on public.order_events (order_id, created_at);
create index if not exists messages_pair_idx        on public.messages (request_id, sender_id, recipient_id, created_at);
create index if not exists messages_recipient_idx   on public.messages (recipient_id, read_at);
create index if not exists notifications_user_idx   on public.notifications (user_id, created_at desc);
create index if not exists reviews_supplier_idx     on public.reviews (supplier_id);
create index if not exists products_supplier_idx    on public.supplier_products (supplier_id);
create index if not exists reports_status_idx       on public.reports (status, created_at desc);
