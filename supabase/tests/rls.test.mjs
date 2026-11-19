// ACİLCEP database tests: runs the real SQL (supabase/setup.sql) on PostgreSQL
// with a minimal Supabase stand-in, then exercises the full business flow and
// the Row Level Security rules as real API roles (anon / authenticated).
//
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
import pg from 'pg';
import { readFileSync } from 'node:fs';

const ADMIN_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const DB = 'acilcep_rls_test';

const root = new pg.Client({ connectionString: ADMIN_URL });
await root.connect();
await root.query(`drop database if exists ${DB}`);
await root.query(`create database ${DB}`);
await root.end();

const url = new URL(ADMIN_URL);
url.pathname = '/' + DB;
const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
const su = (sql, params) => pool.query(sql, params);

await su(readFileSync('supabase/tests/supabase_stub.sql', 'utf8'));
await su(readFileSync('supabase/setup.sql', 'utf8'));

// ---------- helpers ----------
let passed = 0;
let failed = 0;
const results = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    results.push(`  ✘ ${name}\n      ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
async function expectError(promise, re, label = '') {
  try {
    await promise;
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`Wrong error ${label}: ${e.message}`);
    return e;
  }
  throw new Error(`Expected an error ${label} but the query succeeded`);
}
/** Run queries as an API user: 'anon' or a user id (authenticated). */
async function as(uid, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (uid === 'anon') {
      await c.query('set local role anon');
    } else {
      await c.query('set local role authenticated');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uid, role: 'authenticated' }),
      ]);
    }
    const r = await fn((sql, params) => c.query(sql, params));
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
async function signUp(email, meta) {
  const r = await su(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta]);
  return r.rows[0].id;
}

// ---------- users (sign-up goes through the real trigger) ----------
const buyerA = await signUp('a@hotel.test', { role: 'buyer', full_name: 'Ayşe', company_name: 'Hotel A', country: 'TR', currency: 'TRY' });
const buyerB = await signUp('b@cafe.test', { role: 'buyer', company_name: 'Cafe B' });
const sup1 = await signUp('s1@supply.test', { role: 'supplier', company_name: 'Supply One', country: 'TR' });
const sup2 = await signUp('s2@supply.test', { role: 'supplier', company_name: 'Supply Two' });
const sneaky = await signUp('x@evil.test', { role: 'admin', company_name: 'Evil' });
const demoSup = await signUp('demo@supply.test', { role: 'supplier', company_name: 'Demo Supplier', demo: 'true' });
const adminU = await signUp('admin@acilcep.test', { role: 'buyer' });
const catId = (await su(`select id from public.categories where slug = 'hotel-linen'`)).rows[0].id;

// ================= TESTS =================

await test('Sign-up creates profiles with the requested role', async () => {
  const r = await su(`select id, role, plan, is_demo, currency, country from public.profiles`);
  const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert(by[buyerA].role === 'buyer' && by[buyerA].currency === 'TRY' && by[buyerA].country === 'TR', 'buyer A profile');
  assert(by[sup1].role === 'supplier' && by[sup1].plan === 'trial', 'supplier gets trial plan (demo, no payment)');
  assert(by[demoSup].is_demo === true && by[sup1].is_demo === false, 'demo flag');
});

await test('Sign-up metadata cannot create an admin', async () => {
  const r = await su(`select role from public.profiles where id = $1`, [sneaky]);
  assert(r.rows[0].role === 'buyer', 'role must fall back to buyer, got ' + r.rows[0].role);
});

await test('User cannot make themselves admin / change protected fields', async () => {
  await expectError(as(buyerA, (q) => q(`update public.profiles set role = 'admin' where id = $1`, [buyerA])), /Protected/);
  await expectError(as(sup1, (q) => q(`update public.profiles set plan = 'pro' where id = $1`, [sup1])), /Protected/);
  await expectError(as(buyerA, (q) => q(`update public.profiles set is_demo = true where id = $1`, [buyerA])), /Protected/);
  await expectError(as(buyerA, (q) => q(`update public.profiles set trial_ends_at = now() + interval '1 year' where id = $1`, [buyerA])), /Protected/);
});

await test('User can edit own normal profile fields', async () => {
  await as(buyerA, (q) => q(`update public.profiles set phone = '+90 555 000 0000', city = 'Istanbul', address = 'Taksim 1' where id = $1`, [buyerA]));
  await as(sup1, (q) => q(`update public.profiles set phone = '+90 555 111 1111', category_ids = $2 where id = $1`, [sup1, [catId]]));
  const r = await su(`select phone from public.profiles where id = $1`, [buyerA]);
  assert(r.rows[0].phone === '+90 555 000 0000', 'phone updated');
});

await test("Users cannot read other users' private profiles", async () => {
  const r = await as(buyerA, (q) => q(`select id from public.profiles`));
  assert(r.rows.length === 1 && r.rows[0].id === buyerA, 'only own profile visible, got ' + r.rows.length);
  const u = await as(buyerA, (q) => q(`update public.profiles set full_name = 'hacked' where id = $1`, [buyerB]));
  assert(u.rowCount === 0, 'cannot update another profile');
});

await test('Anonymous visitors cannot read profiles or requests, but can read categories', async () => {
  await expectError(as('anon', (q) => q(`select * from public.profiles`)), /permission denied/);
  await expectError(as('anon', (q) => q(`select * from public.requests`)), /permission denied/);
  await expectError(as('anon', (q) => q(`select public.accept_offer(gen_random_uuid())`)), /permission denied/);
  const r = await as('anon', (q) => q(`select count(*)::int as n from public.categories`));
  assert(r.rows[0].n >= 10, 'categories readable');
});

let reqA;
await test('Buyer creates a request; forged fields are ignored', async () => {
  const r = await as(buyerA, (q) =>
    q(
      `insert into public.requests (buyer_id, category_id, title, description, quantity, unit, country, city,
         delivery_address, needed_within_hours, currency, status, is_featured, is_demo)
       values ($1, $2, '200 bath towels', 'White, 70x140', 200, 'pcs', 'TR', 'Istanbul', 'Taksim 1', 4, 'TRY',
         'awarded', true, true) returning *`,
      [buyerB, catId],
    ),
  );
  reqA = r.rows[0];
  assert(reqA.buyer_id === buyerA, 'buyer_id forced to caller');
  assert(reqA.status === 'open' && reqA.is_featured === false && reqA.is_demo === false, 'status/featured/demo forced');
});

await test('Matching suppliers are notified about a new request', async () => {
  const r = await su(`select user_id from public.notifications where type = 'new_request'`);
  const ids = r.rows.map((x) => x.user_id);
  assert(ids.includes(sup1) && ids.includes(sup2), 'real suppliers notified');
  assert(!ids.includes(demoSup), 'demo supplier NOT notified about a real request');
});

await test('Suppliers cannot create requests', async () => {
  await expectError(
    as(sup1, (q) => q(`insert into public.requests (buyer_id, category_id, title, quantity, country, city, delivery_address, currency)
                       values ($1, $2, 'x request', 1, 'TR', 'Ist', 'addr', 'USD')`, [sup1, catId])),
    /row-level security/,
  );
});

await test('Request visibility: owner + real suppliers yes; other buyer and demo users no', async () => {
  const see = async (u) => (await as(u, (q) => q(`select id from public.requests where id = $1`, [reqA.id]))).rows.length;
  assert((await see(buyerA)) === 1, 'owner sees');
  assert((await see(sup1)) === 1, 'supplier sees open request');
  assert((await see(buyerB)) === 0, 'other buyer must not see');
  assert((await see(demoSup)) === 0, 'demo supplier must not see real data');
});

let offer1;
let offer2;
await test('Supplier sends an offer; forged status/currency are ignored', async () => {
  const r = await as(sup1, (q) =>
    q(`insert into public.offers (request_id, supplier_id, price, currency, delivery_minutes, note, status)
       values ($1, $2, 9000, 'EUR', 120, 'Can deliver in 2h', 'accepted') returning *`, [reqA.id, sup2]),
  );
  offer1 = r.rows[0];
  assert(offer1.supplier_id === sup1, 'supplier_id forced to caller');
  assert(offer1.status === 'pending', 'status forced to pending');
  assert(offer1.currency === 'TRY', 'currency forced to request currency');
});

await test('Buyer is notified about the new offer', async () => {
  const r = await as(buyerA, (q) => q(`select type, data from public.notifications where type = 'new_offer'`));
  assert(r.rows.length === 1 && r.rows[0].data.supplier === 'Supply One', 'new_offer notification');
});

await test('Demo supplier cannot offer on real requests; buyers cannot offer', async () => {
  await expectError(
    as(demoSup, (q) => q(`insert into public.offers (request_id, supplier_id, price, currency, delivery_minutes) values ($1, $2, 1, 'TRY', 60)`, [reqA.id, demoSup])),
    /Request not found/,
  );
  await expectError(
    as(buyerB, (q) => q(`insert into public.offers (request_id, supplier_id, price, currency, delivery_minutes) values ($1, $2, 1, 'TRY', 60)`, [reqA.id, buyerB])),
    /row-level security|Request not found/,
  );
});

await test('Offer visibility: own supplier + request owner only', async () => {
  offer2 = (
    await as(sup2, (q) =>
      q(`insert into public.offers (request_id, supplier_id, price, currency, delivery_minutes) values ($1, $2, 8500, 'TRY', 240) returning *`, [reqA.id, sup2]),
    )
  ).rows[0];
  const n = async (u) => (await as(u, (q) => q(`select id from public.offers where request_id = $1`, [reqA.id]))).rows.length;
  assert((await n(buyerA)) === 2, 'owner sees both offers');
  assert((await n(sup1)) === 1, "supplier 1 sees only own offer");
  assert((await n(sup2)) === 1, "supplier 2 sees only own offer");
  assert((await n(buyerB)) === 0, 'other buyer sees none');
});

await test('Suppliers can only change their own offers, and cannot accept them', async () => {
  await expectError(as(sup1, (q) => q(`update public.offers set status = 'accepted' where id = $1`, [offer1.id])), /only edit or withdraw/);
  const u = await as(sup2, (q) => q(`update public.offers set price = 1 where id = $1`, [offer1.id]));
  assert(u.rowCount === 0, "supplier 2 cannot touch supplier 1's offer");
  await as(sup1, (q) => q(`update public.offers set price = 8800, delivery_minutes = 90 where id = $1`, [offer1.id]));
  const r = await su(`select price from public.offers where id = $1`, [offer1.id]);
  assert(Number(r.rows[0].price) === 8800, 'own offer updated');
  const nt = await su(`select count(*)::int n from public.notifications where type = 'offer_updated' and user_id = $1`, [buyerA]);
  assert(nt.rows[0].n === 1, 'buyer notified about updated offer');
});

await test('Only the request owner can accept an offer', async () => {
  await expectError(as(sup1, (q) => q(`select public.accept_offer($1)`, [offer1.id])), /Only the request owner/);
  await expectError(as(buyerB, (q) => q(`select public.accept_offer($1)`, [offer1.id])), /Only the request owner/);
});

let orderId;
await test('Buyer accepts an offer: order created, other offers rejected, request awarded', async () => {
  const r = await as(buyerA, (q) => q(`select public.accept_offer($1) as id`, [offer1.id]));
  orderId = r.rows[0].id;
  const o = await su(`select * from public.orders where id = $1`, [orderId]);
  assert(o.rows[0].status === 'confirmed' && Number(o.rows[0].price) === 8800 && o.rows[0].supplier_id === sup1, 'order row');
  const offers = await su(`select id, status from public.offers where request_id = $1`, [reqA.id]);
  const st = Object.fromEntries(offers.rows.map((x) => [x.id, x.status]));
  assert(st[offer1.id] === 'accepted' && st[offer2.id] === 'rejected', 'offer statuses');
  const rq = await su(`select status, accepted_offer_id from public.requests where id = $1`, [reqA.id]);
  assert(rq.rows[0].status === 'awarded' && rq.rows[0].accepted_offer_id === offer1.id, 'request awarded');
  const n1 = await as(sup1, (q) => q(`select type from public.notifications where type = 'offer_accepted'`));
  const n2 = await as(sup2, (q) => q(`select type from public.notifications where type = 'offer_rejected'`));
  assert(n1.rows.length === 1 && n2.rows.length === 1, 'accept/reject notifications');
});

await test('An offer cannot be accepted twice; closed offers cannot be edited', async () => {
  await expectError(as(buyerA, (q) => q(`select public.accept_offer($1)`, [offer2.id])), /no longer open/);
  await expectError(as(sup2, (q) => q(`update public.offers set price = 1 where id = $1`, [offer2.id])), /no longer be changed/);
});

await test('Supplier still sees a request they offered on after it closed', async () => {
  const r = await as(sup2, (q) => q(`select status from public.requests where id = $1`, [reqA.id]));
  assert(r.rows.length === 1 && r.rows[0].status === 'awarded', 'visible via own offer');
});

await test('Order visibility: only buyer and winning supplier', async () => {
  const n = async (u) => (await as(u, (q) => q(`select id from public.orders`))).rows.length;
  assert((await n(buyerA)) === 1 && (await n(sup1)) === 1, 'parties see order');
  assert((await n(sup2)) === 0 && (await n(buyerB)) === 0, 'others do not');
});

await test('Orders cannot be created or changed directly', async () => {
  const u = await as(sup1, (q) => q(`update public.orders set status = 'delivered' where id = $1`, [orderId]));
  assert(u.rowCount === 0, 'direct update blocked');
  await expectError(
    as(buyerA, (q) => q(`insert into public.orders (request_id, offer_id, buyer_id, supplier_id, price, currency) values ($1, $2, $3, $4, 1, 'TRY')`, [reqA.id, offer2.id, buyerA, sup2])),
    /row-level security/,
  );
});

await test('Order status flow follows the allowed steps', async () => {
  await expectError(as(sup1, (q) => q(`select public.update_order_status($1, 'delivered')`, [orderId])), /not allowed/);
  await expectError(as(sup2, (q) => q(`select public.update_order_status($1, 'preparing')`, [orderId])), /Not allowed/);
  await as(sup1, (q) => q(`select public.update_order_status($1, 'preparing', 'Packing now')`, [orderId]));
  await expectError(as(buyerA, (q) => q(`select public.update_order_status($1, 'on_the_way')`, [orderId])), /not allowed/);
  await as(sup1, (q) => q(`select public.update_order_status($1, 'on_the_way')`, [orderId]));
  await as(buyerA, (q) => q(`select public.update_order_status($1, 'delivered', 'Received, thanks')`, [orderId]));
  const o = await su(`select status from public.orders where id = $1`, [orderId]);
  assert(o.rows[0].status === 'delivered', 'delivered');
  const rq = await su(`select status from public.requests where id = $1`, [reqA.id]);
  assert(rq.rows[0].status === 'closed', 'request closed after delivery');
  const ev = await as(buyerA, (q) => q(`select status from public.order_events where order_id = $1 order by id`, [orderId]));
  assert(ev.rows.map((x) => x.status).join(',') === 'confirmed,preparing,on_the_way,delivered', 'history: ' + ev.rows.map((x) => x.status));
  const ev2 = await as(sup2, (q) => q(`select id from public.order_events where order_id = $1`, [orderId]));
  assert(ev2.rows.length === 0, 'outsider cannot read order history');
  await expectError(as(sup1, (q) => q(`select public.update_order_status($1, 'cancelled')`, [orderId])), /not allowed/);
});

await test('Contact details are shared only with the parties of an order', async () => {
  const a = await as(buyerA, (q) => q(`select * from public.get_order_contact($1)`, [orderId]));
  assert(a.rows[0].phone === '+90 555 111 1111', 'buyer gets supplier phone');
  const s = await as(sup1, (q) => q(`select * from public.get_order_contact($1)`, [orderId]));
  assert(s.rows[0].phone === '+90 555 000 0000', 'supplier gets buyer phone');
  const x = await as(buyerB, (q) => q(`select * from public.get_order_contact($1)`, [orderId]));
  assert(x.rows.length === 0, 'outsider gets nothing');
});

await test('Only the buyer of a delivered order can rate the supplier, once', async () => {
  await expectError(as(sup1, (q) => q(`insert into public.reviews (order_id, buyer_id, supplier_id, rating) values ($1, $2, $2, 5)`, [orderId, sup1])), /row-level security/);
  await expectError(as(buyerB, (q) => q(`insert into public.reviews (order_id, buyer_id, supplier_id, rating) values ($1, $2, $3, 1)`, [orderId, buyerB, sup1])), /row-level security/);
  await as(buyerA, (q) => q(`insert into public.reviews (order_id, buyer_id, supplier_id, rating, comment) values ($1, $2, $3, 5, 'Fast!')`, [orderId, buyerA, sup2]));
  const r = await su(`select supplier_id, rating from public.reviews`);
  assert(r.rows[0].supplier_id === sup1, 'supplier_id forced from order');
  await expectError(as(buyerA, (q) => q(`insert into public.reviews (order_id, buyer_id, supplier_id, rating) values ($1, $2, $3, 4)`, [orderId, buyerA, sup1])), /duplicate|unique/);
});

await test('Public supplier profile shows rating but never phone/address', async () => {
  const r = await as(buyerB, (q) => q(`select * from public.public_profiles where id = $1`, [sup1]));
  assert(r.rows.length === 1, 'visible');
  assert(Number(r.rows[0].avg_rating) === 5 && r.rows[0].review_count === 1 && r.rows[0].completed_orders === 1, 'stats');
  assert(!('phone' in r.rows[0]) && !('address' in r.rows[0]), 'no private columns');
  const d = await as(buyerB, (q) => q(`select * from public.public_profiles where id = $1`, [demoSup]));
  assert(d.rows.length === 0, 'demo profiles hidden from real users');
});

await test('Messaging rules', async () => {
  await as(sup2, (q) => q(`insert into public.messages (request_id, sender_id, recipient_id, body) values ($1, $2, $3, 'Any future needs?')`, [reqA.id, sup2, buyerA]));
  await as(buyerA, (q) => q(`insert into public.messages (request_id, sender_id, recipient_id, body) values ($1, $2, $3, 'Thanks, maybe!')`, [reqA.id, buyerA, sup2]));
  await expectError(
    as(buyerB, (q) => q(`insert into public.messages (request_id, sender_id, recipient_id, body) values ($1, $2, $3, 'hi')`, [reqA.id, buyerB, sup1])),
    /row-level security/,
  );
  await expectError(
    as(sup1, (q) => q(`insert into public.messages (request_id, sender_id, recipient_id, body) values ($1, $2, $3, 'spoof')`, [reqA.id, buyerA, sup2])),
    /row-level security/,
  );
  const mine = await as(sup2, (q) => q(`select body from public.messages`));
  assert(mine.rows.length === 2, 'participants see thread');
  const other = await as(sup1, (q) => q(`select body from public.messages`));
  assert(other.rows.length === 0, 'non-participant sees nothing');
  await as(buyerA, (q) => q(`select public.mark_messages_read($1, $2)`, [reqA.id, sup2]));
  const unread = await su(`select count(*)::int n from public.messages where recipient_id = $1 and read_at is null`, [buyerA]);
  assert(unread.rows[0].n === 0, 'marked read');
});

await test('Notifications are private and cannot be forged', async () => {
  const r = await as(buyerB, (q) => q(`select * from public.notifications`));
  assert(r.rows.length === 0, 'buyer B has none');
  await expectError(
    as(buyerB, (q) => q(`insert into public.notifications (user_id, type) values ($1, 'fake')`, [buyerA])),
    /row-level security/,
  );
  await expectError(as(buyerB, (q) => q(`select public.notify($1, 'x', '{}', null)`, [buyerA])), /permission denied/);
  await as(buyerA, (q) => q(`select public.mark_notifications_read(null)`));
  const left = await su(`select count(*)::int n from public.notifications where user_id = $1 and read_at is null`, [buyerA]);
  assert(left.rows[0].n === 0, 'all marked read');
});

await test('Buyer can cancel own open request but not reopen, feature or edit it', async () => {
  const r = await as(buyerA, (q) =>
    q(`insert into public.requests (buyer_id, category_id, title, quantity, country, city, delivery_address, currency) values ($1, $2, 'Napkins', 50, 'TR', 'Istanbul', 'Taksim', 'TRY') returning id`, [buyerA, catId]),
  );
  const id = r.rows[0].id;
  await expectError(as(buyerA, (q) => q(`update public.requests set is_featured = true where id = $1`, [id])), /Only admins/);
  await expectError(as(buyerA, (q) => q(`update public.requests set status = 'closed' where id = $1`, [id])), /only cancel/);
  const u = await as(buyerB, (q) => q(`update public.requests set status = 'cancelled' where id = $1`, [id]));
  assert(u.rowCount === 0, 'other buyer cannot cancel');
  await as(buyerA, (q) => q(`update public.requests set status = 'cancelled' where id = $1`, [id]));
  await expectError(as(buyerA, (q) => q(`update public.requests set title = 'changed' where id = $1`, [id])), /Only open/);
  await expectError(as(buyerA, (q) => q(`update public.requests set status = 'open' where id = $1`, [id])), /Only open/);
});

await test('Demo world is separate: demo data invisible to real users and vice versa', async () => {
  const demoBuyer = await signUp('demobuyer@x.test', { role: 'buyer', demo: 'true' });
  const r = await as(demoBuyer, (q) =>
    q(`insert into public.requests (buyer_id, category_id, title, quantity, country, city, delivery_address, currency) values ($1, $2, 'Demo milk', 10, 'TR', 'Izmir', 'Demo st', 'TRY') returning id, is_demo`, [demoBuyer, catId]),
  );
  assert(r.rows[0].is_demo === true, 'demo request flagged');
  const real = await as(sup1, (q) => q(`select id from public.requests where id = $1`, [r.rows[0].id]));
  assert(real.rows.length === 0, 'real supplier cannot see demo request');
  const demo = await as(demoSup, (q) => q(`select id from public.requests where id = $1`, [r.rows[0].id]));
  assert(demo.rows.length === 1, 'demo supplier sees demo request');
  await expectError(
    as(sup1, (q) => q(`insert into public.offers (request_id, supplier_id, price, currency, delivery_minutes) values ($1, $2, 1, 'TRY', 60)`, [r.rows[0].id, sup1])),
    /Request not found/,
  );
});

await test('Admin rights: only via SQL editor; admin can moderate', async () => {
  await expectError(as(buyerA, (q) => q(`select public.admin_stats()`)), /Admins only/, 'stats');
  await expectError(as(buyerA, (q) => q(`select public.admin_set_user_suspended($1, true)`, [buyerB])), /Admins only/, 'suspend');
  // Done by the owner in the Supabase SQL editor:
  await su(`update public.profiles set role = 'admin' where id = $1`, [adminU]);
  const s = await as(adminU, (q) => q(`select public.admin_stats() as s`));
  assert(s.rows[0].s.users >= 7, 'stats');
  const all = await as(adminU, (q) => q(`select count(*)::int n from public.requests`));
  assert(all.rows[0].n >= 3, 'admin sees all requests');
  const profs = await as(adminU, (q) => q(`select count(*)::int n from public.profiles`));
  assert(profs.rows[0].n >= 7, 'admin sees all profiles');
  await as(adminU, (q) => q(`select public.admin_set_user_suspended($1, true)`, [buyerB]));
  await expectError(
    as(buyerB, (q) => q(`insert into public.requests (buyer_id, category_id, title, quantity, country, city, delivery_address, currency) values ($1, $2, 'Blocked', 1, 'TR', 'Ist', 'addr', 'TRY')`, [buyerB, catId])),
    /row-level security/, 'suspended insert'
  );
  // Even an admin cannot grant admin from the app.
  const pr = await as(adminU, (q) => q(`update public.profiles set role = 'admin' where id = $1`, [buyerA]));
  assert(pr.rowCount === 0, 'admin cannot edit other profiles from the app');
  const ro = await su(`select role from public.profiles where id = $1`, [buyerA]);
  assert(ro.rows[0].role === 'buyer', 'role unchanged');
  await as(adminU, (q) => q(`update public.requests set is_featured = true where id = $1`, [reqA.id]));
});

await test('Complaints: users see only their own; admin resolves', async () => {
  await as(buyerA, (q) => q(`insert into public.reports (reporter_id, target_type, target_id, reason, status) values ($1, 'user', $2, 'Spam messages', 'resolved')`, [buyerB, sup2]));
  const own = await as(buyerA, (q) => q(`select status, reporter_id from public.reports`));
  assert(own.rows.length === 1 && own.rows[0].status === 'open' && own.rows[0].reporter_id === buyerA, 'forced open + reporter');
  const other = await as(sup1, (q) => q(`select id from public.reports`));
  assert(other.rows.length === 0, 'others cannot see');
  const id = (await su(`select id from public.reports`)).rows[0].id;
  await expectError(as(buyerA, (q) => q(`select public.admin_resolve_report($1, 'resolved', 'x')`, [id])), /Admins only/);
  await as(adminU, (q) => q(`select public.admin_resolve_report($1, 'resolved', 'Warned user')`, [id]));
  const r = await su(`select status, resolved_by from public.reports where id = $1`, [id]);
  assert(r.rows[0].status === 'resolved' && r.rows[0].resolved_by === adminU, 'resolved');
});

await test('Photo upload policy: buyers can only upload into their own folder', async () => {
  await as(buyerA, (q) => q(`insert into storage.objects (bucket_id, name) values ('request-photos', $1)`, [`${buyerA}/towels.jpg`]));
  await expectError(
    as(buyerA, (q) => q(`insert into storage.objects (bucket_id, name) values ('request-photos', $1)`, [`${sup1}/x.jpg`])),
    /row-level security/,
  );
  await expectError(
    as(sup1, (q) => q(`insert into storage.objects (bucket_id, name) values ('request-photos', $1)`, [`${sup1}/x.jpg`])),
    /row-level security/,
  );
});

await test('Supplier products: owner manages, others read only', async () => {
  const p = await as(sup1, (q) => q(`insert into public.supplier_products (supplier_id, name, price, currency) values ($1, 'Bath towel 70x140', 45, 'TRY') returning id, supplier_id`, [sup2]));
  assert(p.rows[0].supplier_id === sup1, 'owner forced');
  const u = await as(sup2, (q) => q(`update public.supplier_products set price = 1 where id = $1`, [p.rows[0].id]));
  assert(u.rowCount === 0, 'other supplier cannot edit');
  const d = await as(sup2, (q) => q(`delete from public.supplier_products where id = $1`, [p.rows[0].id]));
  assert(d.rowCount === 0, 'other supplier cannot delete');
  const r = await as(buyerA, (q) => q(`select name from public.supplier_products`));
  assert(r.rows.length === 1, 'buyers can browse');
  await expectError(as(buyerA, (q) => q(`insert into public.supplier_products (supplier_id, name) values ($1, 'x product')`, [buyerA])), /row-level security/);
});

await pool.end();
console.log('\nACİLCEP database tests\n' + results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
