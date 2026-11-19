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
