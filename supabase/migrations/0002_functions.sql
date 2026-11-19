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
