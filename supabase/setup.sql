-- ACİLCEP – complete database setup (generated from supabase/migrations by `npm run db:bundle`).
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run again.

-- >>> 0001_schema.sql
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


-- >>> 0002_functions.sql
-- =====================================================================
-- ACİLCEP – 0002: Helper functions, guard triggers, notifications, RPCs
-- Security model:
--   * Direct client calls run as role "authenticated" -> guard triggers
--     block changes to protected columns (role, plan, status, etc.).
--   * Privileged state changes (accept offer, order status, admin actions)
--     only happen inside SECURITY DEFINER functions that check auth.uid().
--   * Admin role can only be granted from the Supabase SQL editor.
-- =====================================================================

-- ---------- Generic helpers ----------

-- True when the statement comes directly from the API (anon/authenticated),
-- false inside SECURITY DEFINER functions or the SQL editor.
create or replace function public.is_client_call()
returns boolean language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and not p.is_suspended
  );
$$;

-- Role of the caller; NULL when not logged in or suspended.
create or replace function public.my_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and not p.is_suspended;
$$;

create or replace function public.my_is_demo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.owns_request(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.requests r where r.id = p_request and r.buyer_id = auth.uid());
$$;

create or replace function public.has_offer_on(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.offers o where o.request_id = p_request and o.supplier_id = auth.uid());
$$;

create or replace function public.is_order_party(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order and auth.uid() in (o.buyer_id, o.supplier_id)
  );
$$;

-- Messaging rules:
--  * a supplier may message the buyer of an open request (or one they offered on)
--  * a buyer may message a supplier who offered on, or already wrote about, their request
create or replace function public.can_message(p_request uuid, p_recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.requests r
    join public.profiles me on me.id = auth.uid() and not me.is_suspended
    join public.profiles them on them.id = p_recipient and not them.is_suspended
    where r.id = p_request
      and me.is_demo = r.is_demo
      and them.is_demo = r.is_demo
      and (
        ( r.buyer_id = p_recipient
          and me.role = 'supplier'
          and ( r.status = 'open'
                or exists (select 1 from public.offers o where o.request_id = r.id and o.supplier_id = me.id) ) )
        or
        ( r.buyer_id = me.id
          and ( exists (select 1 from public.offers o where o.request_id = r.id and o.supplier_id = p_recipient)
                or exists (select 1 from public.messages m where m.request_id = r.id
                           and m.sender_id = p_recipient and m.recipient_id = me.id) ) )
      )
  );
$$;

create or replace function public.can_review(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order and o.buyer_id = auth.uid() and o.status = 'delivered'
  );
$$;

-- Internal: create a notification (not callable from the API).
create or replace function public.notify(p_user uuid, p_type text, p_data jsonb, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, data, link)
  values (p_user, p_type, coalesce(p_data, '{}'::jsonb), p_link);
$$;

create or replace function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(p.company_name, ''), nullif(p.full_name, ''), 'User')
  from public.profiles p where p.id = p_user;
$$;

-- ---------- New user -> profile ----------
-- Only 'buyer' or 'supplier' can come from sign-up metadata. Never 'admin'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role public.user_role := case when v_meta->>'role' = 'supplier' then 'supplier'::public.user_role
                                  else 'buyer'::public.user_role end;
begin
  insert into public.profiles (id, role, full_name, company_name, language, currency, country, city,
                               is_demo, plan, trial_ends_at)
  values (
    new.id,
    v_role,
    left(coalesce(v_meta->>'full_name', ''), 120),
    left(coalesce(v_meta->>'company_name', ''), 160),
    case when v_meta->>'language' = 'tr' then 'tr' else 'en' end,
    case when coalesce(v_meta->>'currency', '') ~ '^[A-Z]{3}$' then v_meta->>'currency' else 'USD' end,
    case when coalesce(v_meta->>'country', '') ~ '^[A-Z]{2}$' then v_meta->>'country' else null end,
    nullif(left(coalesce(v_meta->>'city', ''), 100), ''),
    coalesce(v_meta->>'demo', 'false') = 'true',
    case when v_role = 'supplier' then 'trial'::public.supplier_plan end,
    case when v_role = 'supplier' then now() + interval '14 days' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Guard triggers (SECURITY INVOKER on purpose) ----------

create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_client_call() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.plan is distinct from old.plan
       or new.trial_ends_at is distinct from old.trial_ends_at
       or new.is_demo is distinct from old.is_demo
       or new.is_suspended is distinct from old.is_suspended
       or new.created_at is distinct from old.created_at then
      raise exception 'Protected profile fields cannot be changed' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.requests_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_client_call() then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.buyer_id := auth.uid();
    new.status := 'open';
    new.is_featured := false;
    new.accepted_offer_id := null;
    new.is_demo := public.my_is_demo();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id
     or new.buyer_id is distinct from old.buyer_id
     or new.is_demo is distinct from old.is_demo
     or new.accepted_offer_id is distinct from old.accepted_offer_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Protected request fields cannot be changed' using errcode = '42501';
  end if;

  if new.is_featured is distinct from old.is_featured and not public.is_admin() then
    raise exception 'Only admins can feature requests' using errcode = '42501';
  end if;

  if public.is_admin() then
    if new.status is distinct from old.status and new.status not in ('cancelled', 'closed') then
      raise exception 'Admins can only cancel or close requests' using errcode = '42501';
    end if;
  else
    if old.status <> 'open' then
      raise exception 'Only open requests can be edited' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status <> 'cancelled' then
      raise exception 'You can only cancel your request' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists requests_guard on public.requests;
create trigger requests_guard before insert or update on public.requests
  for each row execute function public.requests_guard();

create or replace function public.request_is_open(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.requests r where r.id = p_request and r.status = 'open');
$$;

create or replace function public.offers_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_req record;
begin
  if not public.is_client_call() then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Runs as the caller: the request must be visible to this supplier (RLS),
    -- which also enforces demo/real separation.
    select r.id, r.status, r.currency, r.is_demo, r.buyer_id
      into v_req from public.requests r where r.id = new.request_id;
    if not found then
      raise exception 'Request not found' using errcode = 'P0002';
    end if;
    if v_req.status <> 'open' then
      raise exception 'This request is no longer accepting offers' using errcode = '42501';
    end if;
    if v_req.buyer_id = auth.uid() then
      raise exception 'You cannot offer on your own request' using errcode = '42501';
    end if;
    new.supplier_id := auth.uid();
    new.status := 'pending';
    new.currency := v_req.currency;
    new.is_demo := v_req.is_demo;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE (supplier editing or withdrawing own offer)
  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.supplier_id is distinct from old.supplier_id
     or new.currency is distinct from old.currency
     or new.is_demo is distinct from old.is_demo
     or new.created_at is distinct from old.created_at then
    raise exception 'Protected offer fields cannot be changed' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'This offer can no longer be changed' using errcode = '42501';
  end if;
  if new.status not in ('pending', 'withdrawn') then
    raise exception 'Suppliers can only edit or withdraw offers' using errcode = '42501';
  end if;
  if not public.request_is_open(old.request_id) then
    raise exception 'This request is no longer open' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists offers_guard on public.offers;
create trigger offers_guard before insert or update on public.offers
  for each row execute function public.offers_guard();

create or replace function public.request_is_demo(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select r.is_demo from public.requests r where r.id = p_request), false);
$$;

create or replace function public.messages_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_client_call() then
    new.sender_id := auth.uid();
    new.read_at := null;
    new.is_demo := public.request_is_demo(new.request_id);
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages
  for each row execute function public.messages_guard();

create or replace function public.products_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_client_call() then
    if tg_op = 'INSERT' then
      new.supplier_id := auth.uid();
      new.is_demo := public.my_is_demo();
      new.created_at := now();
    else
      if new.supplier_id is distinct from old.supplier_id
         or new.is_demo is distinct from old.is_demo
         or new.created_at is distinct from old.created_at then
        raise exception 'Protected product fields cannot be changed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard on public.supplier_products;
create trigger products_guard before insert or update on public.supplier_products
  for each row execute function public.products_guard();

create or replace function public.order_is_demo(p_order uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select o.is_demo from public.orders o where o.id = p_order), false);
$$;

create or replace function public.order_supplier(p_order uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select o.supplier_id from public.orders o where o.id = p_order;
$$;

create or replace function public.reviews_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_client_call() then
    new.buyer_id := auth.uid();
    new.supplier_id := public.order_supplier(new.order_id);
    new.is_demo := public.order_is_demo(new.order_id);
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard before insert on public.reviews
  for each row execute function public.reviews_guard();

create or replace function public.reports_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_client_call() then
    new.reporter_id := auth.uid();
    new.status := 'open';
    new.admin_note := null;
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists reports_guard on public.reports;
create trigger reports_guard before insert on public.reports
  for each row execute function public.reports_guard();

-- ---------- Notification triggers ----------

create or replace function public.on_request_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'open' then return new; end if;
  insert into public.notifications (user_id, type, data, link)
  select p.id, 'new_request',
         jsonb_build_object('request_title', new.title, 'city', new.city, 'country', new.country),
         '/requests/' || new.id
  from public.profiles p
  where p.role = 'supplier'
    and not p.is_suspended
    and p.id <> new.buyer_id
    and p.is_demo = new.is_demo
    and (p.country is null or p.country = new.country)
    and (cardinality(p.category_ids) = 0 or new.category_id = any (p.category_ids))
  limit 300;
  return new;
end;
$$;

drop trigger if exists on_request_created on public.requests;
create trigger on_request_created after insert on public.requests
  for each row execute function public.on_request_created();

create or replace function public.on_offer_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_req record;
begin
  select r.buyer_id, r.title into v_req from public.requests r where r.id = new.request_id;
  perform public.notify(
    v_req.buyer_id, 'new_offer',
    jsonb_build_object('request_title', v_req.title, 'supplier', public.display_name(new.supplier_id),
                       'price', new.price, 'currency', new.currency),
    '/requests/' || new.request_id);
  return new;
end;
$$;

drop trigger if exists on_offer_created on public.offers;
create trigger on_offer_created after insert on public.offers
  for each row execute function public.on_offer_created();

create or replace function public.on_offer_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_req record;
begin
  select r.buyer_id, r.title into v_req from public.requests r where r.id = new.request_id;
  if new.status = 'withdrawn' and old.status = 'pending' then
    perform public.notify(v_req.buyer_id, 'offer_withdrawn',
      jsonb_build_object('request_title', v_req.title, 'supplier', public.display_name(new.supplier_id)),
      '/requests/' || new.request_id);
  elsif new.status = 'pending' and old.status = 'pending'
        and (new.price <> old.price or new.delivery_minutes <> old.delivery_minutes) then
    perform public.notify(v_req.buyer_id, 'offer_updated',
      jsonb_build_object('request_title', v_req.title, 'supplier', public.display_name(new.supplier_id),
                         'price', new.price, 'currency', new.currency),
      '/requests/' || new.request_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_offer_updated on public.offers;
create trigger on_offer_updated after update on public.offers
  for each row execute function public.on_offer_updated();

create or replace function public.on_message_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(new.recipient_id, 'new_message',
    jsonb_build_object('from', public.display_name(new.sender_id), 'preview', left(new.body, 80)),
    '/messages/' || new.request_id || '/' || new.sender_id);
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created after insert on public.messages
  for each row execute function public.on_message_created();

-- updated_at for orders
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- RPCs (called from the app) ----------

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers;
  v_req public.requests;
  v_order uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if public.my_role() is null then
    raise exception 'Account suspended' using errcode = '42501';
  end if;

  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found' using errcode = 'P0002'; end if;

  select * into v_req from public.requests where id = v_offer.request_id for update;
  if v_req.buyer_id <> v_uid then
    raise exception 'Only the request owner can accept offers' using errcode = '42501';
  end if;
  if v_req.status <> 'open' then
    raise exception 'This request is no longer open' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer available' using errcode = '42501';
  end if;

  update public.offers set status = 'accepted' where id = p_offer_id;

  with rejected as (
    update public.offers set status = 'rejected'
    where request_id = v_req.id and id <> p_offer_id and status = 'pending'
    returning supplier_id
  )
  insert into public.notifications (user_id, type, data, link)
  select supplier_id, 'offer_rejected', jsonb_build_object('request_title', v_req.title), '/requests/' || v_req.id
  from rejected;

  update public.requests set status = 'awarded', accepted_offer_id = p_offer_id where id = v_req.id;

  insert into public.orders (request_id, offer_id, buyer_id, supplier_id, price, currency, is_demo)
  values (v_req.id, p_offer_id, v_uid, v_offer.supplier_id, v_offer.price, v_offer.currency, v_req.is_demo)
  returning id into v_order;

  insert into public.order_events (order_id, status, actor_id) values (v_order, 'confirmed', v_uid);

  perform public.notify(v_offer.supplier_id, 'offer_accepted',
    jsonb_build_object('request_title', v_req.title, 'buyer', public.display_name(v_uid)),
    '/orders/' || v_order);

  return v_order;
end;
$$;

create or replace function public.reject_offer(p_offer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.offers;
  v_req public.requests;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found' using errcode = 'P0002'; end if;
  select * into v_req from public.requests where id = v_offer.request_id;
  if v_req.buyer_id <> v_uid then
    raise exception 'Only the request owner can reject offers' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is no longer pending' using errcode = '42501';
  end if;
  update public.offers set status = 'rejected' where id = p_offer_id;
  perform public.notify(v_offer.supplier_id, 'offer_rejected',
    jsonb_build_object('request_title', v_req.title), '/requests/' || v_req.id);
end;
$$;

create or replace function public.update_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_admin boolean := public.is_admin();
  v_ok boolean := false;
  v_other uuid;
  v_title text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if public.my_role() is null then raise exception 'Account suspended' using errcode = '42501'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;

  if not (v_uid in (v_order.buyer_id, v_order.supplier_id) or v_admin) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status = v_order.status then
    raise exception 'Status is already %', p_status using errcode = '22023';
  end if;

  if v_admin then
    v_ok := true;
  elsif v_uid = v_order.supplier_id then
    v_ok := (v_order.status, p_status) in (
      ('confirmed'::public.order_status, 'preparing'::public.order_status),
      ('preparing'::public.order_status, 'on_the_way'::public.order_status),
      ('on_the_way'::public.order_status, 'delivered'::public.order_status),
      ('confirmed'::public.order_status, 'cancelled'::public.order_status),
      ('preparing'::public.order_status, 'cancelled'::public.order_status));
  elsif v_uid = v_order.buyer_id then
    v_ok := (v_order.status, p_status) in (
      ('on_the_way'::public.order_status, 'delivered'::public.order_status),
      ('confirmed'::public.order_status, 'cancelled'::public.order_status));
  end if;

  if not v_ok then
    raise exception 'This status change is not allowed' using errcode = '42501';
  end if;

  update public.orders set status = p_status where id = p_order_id;
  insert into public.order_events (order_id, status, actor_id, note)
  values (p_order_id, p_status, v_uid, left(p_note, 500));

  if p_status = 'delivered' then
    update public.requests set status = 'closed' where id = v_order.request_id;
  elsif p_status = 'cancelled' then
    update public.requests set status = 'cancelled' where id = v_order.request_id;
  end if;

  select r.title into v_title from public.requests r where r.id = v_order.request_id;
  v_other := case when v_uid = v_order.supplier_id then v_order.buyer_id else v_order.supplier_id end;
  perform public.notify(v_other, 'order_status',
    jsonb_build_object('status', p_status, 'request_title', v_title), '/orders/' || p_order_id);
  if v_admin and v_uid not in (v_order.buyer_id, v_order.supplier_id) then
    perform public.notify(v_order.buyer_id, 'order_status',
      jsonb_build_object('status', p_status, 'request_title', v_title), '/orders/' || p_order_id);
  end if;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.mark_messages_read(p_request uuid, p_other uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages set read_at = now()
  where request_id = p_request and sender_id = p_other and recipient_id = auth.uid() and read_at is null;
$$;

-- Contact details of the other party, only for parties of an order.
create or replace function public.get_order_contact(p_order_id uuid)
returns table (full_name text, company_name text, phone text, city text, address text)
language sql stable security definer set search_path = '' as $$
  select p.full_name, p.company_name, p.phone, p.city, p.address
  from public.orders o
  join public.profiles p
    on p.id = case when auth.uid() = o.buyer_id then o.supplier_id else o.buyer_id end
  where o.id = p_order_id and auth.uid() in (o.buyer_id, o.supplier_id);
$$;

-- ---------- Admin RPCs ----------

create or replace function public.admin_set_user_suspended(p_user uuid, p_suspended boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot suspend yourself' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'Admins cannot be suspended from the app' using errcode = '42501';
  end if;
  update public.profiles set is_suspended = p_suspended where id = p_user;
  if p_suspended then
    -- Close open requests and withdraw pending offers of a suspended user.
    update public.requests set status = 'cancelled' where buyer_id = p_user and status = 'open';
    update public.offers set status = 'withdrawn' where supplier_id = p_user and status = 'pending';
  end if;
end;
$$;

create or replace function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.reports
  set status = p_status, admin_note = left(p_note, 1000),
      resolved_by = case when p_status = 'open' then null else auth.uid() end,
      resolved_at = case when p_status = 'open' then null else now() end
  where id = p_report;
end;
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'buyers', (select count(*) from public.profiles where role = 'buyer'),
    'suppliers', (select count(*) from public.profiles where role = 'supplier'),
    'open_requests', (select count(*) from public.requests where status = 'open'),
    'offers', (select count(*) from public.offers),
    'orders', (select count(*) from public.orders),
    'open_reports', (select count(*) from public.reports where status = 'open')
  );
end;
$$;

-- ---------- Public profile view (no phone / address / email) ----------
create or replace view public.public_profiles with (security_barrier = true) as
select
  p.id, p.role, p.full_name, p.company_name, p.country, p.city, p.bio, p.website,
  p.category_ids, p.is_demo, p.created_at,
  coalesce(rv.avg_rating, 0)::numeric(3, 2) as avg_rating,
  coalesce(rv.review_count, 0)::int as review_count,
  coalesce(od.completed_orders, 0)::int as completed_orders
from public.profiles p
left join lateral (
  select avg(r.rating) as avg_rating, count(*) as review_count
  from public.reviews r where r.supplier_id = p.id
) rv on true
left join lateral (
  select count(*) as completed_orders
  from public.orders o where o.supplier_id = p.id and o.status = 'delivered'
) od on true
where auth.uid() is not null
  and (p.id = auth.uid()
       or public.is_admin()
       or (not p.is_suspended and p.is_demo = public.my_is_demo()));


-- >>> 0003_rls.sql
-- =====================================================================
-- ACİLCEP – 0003: Row Level Security policies + grants
-- Every table has RLS enabled. Anything not explicitly allowed is denied.
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.supplier_products enable row level security;
alter table public.requests          enable row level security;
alter table public.offers            enable row level security;
alter table public.orders            enable row level security;
alter table public.order_events      enable row level security;
alter table public.messages          enable row level security;
alter table public.notifications     enable row level security;
alter table public.reviews           enable row level security;
alter table public.reports           enable row level security;

-- Drop old policies so this file can be re-run safely.
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------- profiles (private: own row, or admin) ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- No insert (created by trigger) and no delete from the app.

-- ---------- categories (public read, admin write) ----------
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy categories_admin_ins on public.categories for insert to authenticated with check (public.is_admin());
create policy categories_admin_upd on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin_del on public.categories for delete to authenticated using (public.is_admin());

-- ---------- supplier_products ----------
create policy products_select on public.supplier_products for select to authenticated
  using (supplier_id = auth.uid() or public.is_admin() or is_demo = public.my_is_demo());
create policy products_insert on public.supplier_products for insert to authenticated
  with check (supplier_id = auth.uid() and public.my_role() = 'supplier');
create policy products_update on public.supplier_products for update to authenticated
  using (supplier_id = auth.uid() and public.my_role() = 'supplier')
  with check (supplier_id = auth.uid());
create policy products_delete on public.supplier_products for delete to authenticated
  using (supplier_id = auth.uid() or public.is_admin());

-- ---------- requests ----------
-- Buyer: own requests. Supplier: open requests of the same (real/demo) world,
-- plus requests they have offered on. Admin: all.
create policy requests_select on public.requests for select to authenticated
  using (
    buyer_id = auth.uid()
    or public.is_admin()
    or ( public.my_role() = 'supplier'
         and is_demo = public.my_is_demo()
         and (status = 'open' or public.has_offer_on(id)) )
  );
create policy requests_insert on public.requests for insert to authenticated
  with check (buyer_id = auth.uid() and public.my_role() = 'buyer');
create policy requests_update on public.requests for update to authenticated
  using ((buyer_id = auth.uid() and public.my_role() = 'buyer') or public.is_admin())
  with check ((buyer_id = auth.uid() and public.my_role() = 'buyer') or public.is_admin());
-- No delete: requests are cancelled, not deleted (keeps history).

-- ---------- offers ----------
create policy offers_select on public.offers for select to authenticated
  using (supplier_id = auth.uid() or public.owns_request(request_id) or public.is_admin());
create policy offers_insert on public.offers for insert to authenticated
  with check (supplier_id = auth.uid() and public.my_role() = 'supplier');
create policy offers_update on public.offers for update to authenticated
  using (supplier_id = auth.uid() and public.my_role() = 'supplier')
  with check (supplier_id = auth.uid());
-- Accept / reject only through accept_offer() / reject_offer().

-- ---------- orders (read only; changes via RPC) ----------
create policy orders_select on public.orders for select to authenticated
  using (buyer_id = auth.uid() or supplier_id = auth.uid() or public.is_admin());

create policy order_events_select on public.order_events for select to authenticated
  using (public.is_order_party(order_id) or public.is_admin());

-- ---------- messages ----------
create policy messages_select on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_message(request_id, recipient_id));

-- ---------- notifications ----------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
-- Inserted only by triggers / RPCs. Marked read via mark_notifications_read().

-- ---------- reviews ----------
create policy reviews_select on public.reviews for select to authenticated
  using (is_demo = public.my_is_demo() or buyer_id = auth.uid() or supplier_id = auth.uid() or public.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated
  with check (buyer_id = auth.uid() and public.can_review(order_id));

-- ---------- reports / complaints ----------
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.my_role() is not null);
-- Resolved via admin_resolve_report().

-- ---------- Grants ----------
-- Anonymous visitors can only read categories.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.categories to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.public_profiles to authenticated;

-- Functions: nothing is executable by anon; authenticated gets only what the
-- app and the RLS policies need.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_client_call(), public.is_admin(), public.my_role(), public.my_is_demo(),
  public.owns_request(uuid), public.has_offer_on(uuid), public.is_order_party(uuid),
  public.can_message(uuid, uuid), public.can_review(uuid), public.request_is_open(uuid),
  public.request_is_demo(uuid), public.order_is_demo(uuid), public.order_supplier(uuid),
  public.accept_offer(uuid), public.reject_offer(uuid),
  public.update_order_status(uuid, public.order_status, text),
  public.mark_notifications_read(uuid[]), public.mark_messages_read(uuid, uuid),
  public.get_order_contact(uuid),
  public.admin_set_user_suspended(uuid, boolean),
  public.admin_resolve_report(uuid, public.report_status, text),
  public.admin_stats()
to authenticated;

-- Trigger functions never need EXECUTE for the caller; notify() and
-- display_name() stay internal.


-- >>> 0004_seed_realtime_storage.sql
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
