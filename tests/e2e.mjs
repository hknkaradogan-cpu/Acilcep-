// End-to-end test of the real ACİLCEP frontend in a real Chrome (Android phone size).
// Backend: tests/local-backend/gateway.mjs on top of the real database schema.
//
//   node tests/local-backend/setup-db.mjs
//   node tests/local-backend/gateway.mjs &
//   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local-test-anon-key npx vite build --outDir dist-e2e
//   npx vite preview --outDir dist-e2e --port 4173 &
//   node tests/e2e.mjs
import puppeteer from 'puppeteer-core';

const BASE = process.env.APP_URL || 'http://localhost:4173';
const SHOTS = 'tests/screenshots';
const PHONE = { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const stamp = Date.now();
const results = [];
const pages = {};
let failed = 0;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--lang=en-US'],
});

async function newPhone(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(PHONE);
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  page.on('dialog', (d) => d.accept());
  pages[name] = page;
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  return page;
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`  ✔ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    results.push(`  ✘ ${name}\n      ${e.message.split('\n')[0]}`);
    for (const [n, p] of Object.entries(pages)) await p.screenshot({ path: `${SHOTS}/fail-${failed}-${n}.png` }).catch(() => {});
  }
}

const waitText = (page, text, timeout = 10000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);

async function fill(page, label, value) {
  const ok = await page.evaluate(
    (label, value) => {
      const lab = [...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent?.trim().startsWith(label));
      const el = lab?.querySelector('input, select, textarea');
      if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      return true;
    },
    label,
    value,
  );
  if (!ok) throw new Error(`Field not found: ${label}`);
}

async function selectOptionByText(page, label, text) {
  const ok = await page.evaluate(
    (label, text) => {
      const lab = [...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent?.trim().startsWith(label));
      const el = lab?.querySelector('select');
      const opt = el && [...el.options].find((o) => o.textContent.includes(text));
      if (!opt) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, opt.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    label,
    text,
  );
  if (!ok) throw new Error(`Option "${text}" not found in ${label}`);
}

async function click(page, text, { exact = false, timeout = 10000 } = {}) {
  await page.waitForFunction(
    (text, exact) =>
      [...document.querySelectorAll('button, a')].some((b) => {
        const s = b.textContent.trim();
        return (exact ? s === text : s.includes(text)) && !b.disabled;
      }),
    { timeout },
    text,
    exact,
  );
  await page.evaluate(
    (text, exact) => {
      const el = [...document.querySelectorAll('button, a')].find((b) => {
        const s = b.textContent.trim();
        return (exact ? s === text : s.includes(text)) && !b.disabled;
      });
      el.click();
    },
    text,
    exact,
  );
}

async function shot(page, name) {
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`Horizontal overflow of ${overflow}px on ${name}`);
}

async function signUp(page, { role, name, company, email }) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle0' });
  if (role === 'supplier') await click(page, 'Supplier');
  await fill(page, 'Your name', name);
  await fill(page, 'Business name', company);
  await fill(page, 'Email', email);
  await fill(page, 'Password', 'Passw0rd!x');
  await click(page, 'Create account', { exact: true });
  await page.waitForFunction(() => location.pathname === '/profile', { timeout: 10000 });
  await waitText(page, 'Complete your profile');
}

async function completeProfile(page, { phone, city, currency }) {
  await fill(page, 'Phone', phone);
  await fill(page, 'Country', 'TR');
  await fill(page, 'City', city);
  await fill(page, 'Address', 'Cumhuriyet Cd. 12, Şişli');
  if (currency) await fill(page, 'Currency', currency);
  await click(page, 'Save', { exact: true });
  await waitText(page, 'Saved');
}

const buyer = await newPhone('buyer');
const supplier = await newPhone('supplier');
const outsider = await newPhone('outsider');
const BUYER = { role: 'buyer', name: 'Ayşe Yılmaz', company: 'Grand Bosphorus Hotel', email: `buyer${stamp}@test.local` };
const SUPPLIER = { role: 'supplier', name: 'Mehmet Kaya', company: 'Kaya Tekstil Supply', email: `supplier${stamp}@test.local` };
const TITLE = '200 white bath towels';
let requestUrl = '';
let orderUrl = '';

await step('Landing page renders (EN default) and switches to Turkish', async () => {
  await buyer.goto(BASE, { waitUntil: 'networkidle0' });
  await waitText(buyer, 'Emergency Supply Network');
  await shot(buyer, '01-landing-en');
  await click(buyer, 'TR', { exact: true });
  await waitText(buyer, 'Nasıl çalışır?');
  await shot(buyer, '02-landing-tr');
  await click(buyer, 'EN', { exact: true });
  await waitText(buyer, 'How it works');
});

await step('PWA: manifest, icons and offline service worker are installed', async () => {
  const info = await buyer.evaluate(async () => {
    const m = await (await fetch('/manifest.webmanifest')).json();
    const icons = await Promise.all(m.icons.map(async (i) => (await fetch(i.src)).ok));
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 10000))]);
    return { name: m.name, display: m.display, icons, maskable: m.icons.some((i) => i.purpose === 'maskable'), sw: !!reg?.active };
  });
  if (info.display !== 'standalone' || !info.icons.every(Boolean) || !info.maskable || !info.sw) throw new Error(JSON.stringify(info));
});

await step('Buyer signs up with email and completes profile', async () => {
  await signUp(buyer, BUYER);
  await shot(buyer, '03-buyer-profile-welcome');
  await completeProfile(buyer, { phone: '+90 532 000 0001', city: 'Istanbul', currency: 'TRY' });
});

await step('Supplier signs up and completes profile', async () => {
  await signUp(supplier, SUPPLIER);
  await completeProfile(supplier, { phone: '+90 532 000 0002', city: 'Istanbul', currency: 'TRY' });
  await waitText(supplier, 'Supplier plans');
  await waitText(supplier, 'Demo only');
  await shot(supplier, '04-supplier-profile-plans');
});

await step('Buyer creates an urgent request', async () => {
  await buyer.goto(`${BASE}/app`, { waitUntil: 'networkidle0' });
  await click(buyer, 'New urgent request');
  await waitText(buyer, 'What do you need?');
  await selectOptionByText(buyer, 'Category', 'Hotel linen');
  await fill(buyer, 'What do you need?', TITLE);
  await fill(buyer, 'Quantity', '200');
  await fill(buyer, 'Details', '70x140 cm, 500 g/m², white. Needed for a group arriving tonight.');
  await fill(buyer, 'Needed within', '4');
  await shot(buyer, '05-new-request-form');
  await click(buyer, 'Publish request');
  await buyer.waitForFunction(() => /^\/requests\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 10000 });
  await waitText(buyer, 'No offers yet');
  requestUrl = buyer.url();
  await shot(buyer, '06-request-no-offers');
});

await step('Supplier sees the request in the live feed and gets an alert', async () => {
  await supplier.goto(`${BASE}/app`, { waitUntil: 'networkidle0' });
  await waitText(supplier, TITLE);
  await supplier.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Alerts') && /\d/.test(a.textContent)), { timeout: 10000 });
  await shot(supplier, '07-supplier-live-feed');
});

await step('Supplier sends an offer (price + delivery time)', async () => {
  await click(supplier, TITLE);
  await waitText(supplier, 'Your offer');
  await fill(supplier, 'Price', '8500');
  await fill(supplier, 'Delivery time', '2');
  await fill(supplier, 'Note', 'Hotel-grade cotton, in stock. Our van can deliver in 2 hours.');
  await shot(supplier, '08-supplier-offer-form');
  await click(supplier, 'Send offer', { exact: true });
  await waitText(supplier, 'Offer sent!');
});

await step('Offer appears on the buyer screen in real time (no reload)', async () => {
  await buyer.waitForFunction(() => document.body.innerText.includes('8,500'), { timeout: 15000 });
  await waitText(buyer, SUPPLIER.company);
  await shot(buyer, '09-buyer-offer-live');
});

await step('Buyer accepts the offer → order is created', async () => {
  await click(buyer, '✓ Accept');
  await buyer.waitForFunction(() => /^\/orders\//.test(location.pathname), { timeout: 10000 });
  await waitText(buyer, 'Confirmed');
  await waitText(buyer, '+90 532 000 0002'); // supplier phone shown only after acceptance
  orderUrl = buyer.url();
  await shot(buyer, '10-buyer-order-confirmed');
});

await step('Supplier gets "offer accepted" and moves the order forward', async () => {
  await supplier.goto(`${BASE}/notifications`, { waitUntil: 'networkidle0' });
  await waitText(supplier, 'was accepted');
  await shot(supplier, '11-supplier-notifications');
  await click(supplier, 'was accepted');
  await supplier.waitForFunction(() => /^\/orders\//.test(location.pathname), { timeout: 10000 });
  await click(supplier, 'Start preparing');
  await click(supplier, 'Mark as on the way');
  await waitText(supplier, 'On the way');
  await shot(supplier, '12-supplier-order-on-the-way');
});

await step('Order status changes appear on the buyer screen in real time', async () => {
  await click(buyer, 'I received it', { timeout: 15000 });
  await waitText(buyer, 'Rate this supplier');
});

await step('Buyer rates the supplier', async () => {
  await buyer.evaluate(() => document.querySelectorAll('form button[aria-label="4"]')[0]?.click());
  await fill(buyer, 'Comment', 'Fast and reliable!');
  await click(buyer, 'Submit review');
  await waitText(buyer, 'Your rating');
  await shot(buyer, '13-buyer-order-delivered-review');
});

await step('Buyer and supplier exchange messages', async () => {
  await click(buyer, 'Message');
  await buyer.waitForFunction(() => /^\/messages\//.test(location.pathname));
  await buyer.type('form input[placeholder="Write a message…"]', 'Thank you, towels received!');
  await click(buyer, 'Send', { exact: true });
  await waitText(buyer, 'Thank you, towels received!');
  await supplier.goto(`${BASE}/messages`, { waitUntil: 'networkidle0' });
  await waitText(supplier, 'Thank you, towels received!');
  await click(supplier, BUYER.company);
  await supplier.type('form input[placeholder="Write a message…"]', 'You are welcome 🙏');
  await click(supplier, 'Send', { exact: true });
  await waitText(buyer, 'You are welcome', 15000); // live on the buyer side
  await shot(buyer, '14-chat');
});

await step('History: delivered order is listed under History', async () => {
  await buyer.goto(`${BASE}/orders`, { waitUntil: 'networkidle0' });
  await click(buyer, 'History', { exact: true });
  await waitText(buyer, TITLE);
  await waitText(buyer, 'Delivered');
  await shot(buyer, '15-order-history');
});

await step('Public supplier profile shows the new rating', async () => {
  await supplier.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' });
  await click(supplier, 'Public profile');
  await waitText(supplier, '1 reviews');
  await waitText(supplier, 'Fast and reliable!');
  await shot(supplier, '16-supplier-public-profile');
});

await step('Unauthorized access is blocked (other buyer cannot open request/order)', async () => {
  await signUp(outsider, { role: 'buyer', name: 'Other', company: 'Other Cafe', email: `other${stamp}@test.local` });
  await outsider.goto(requestUrl, { waitUntil: 'networkidle0' });
  await waitText(outsider, 'not found or you do not have access');
  await outsider.goto(orderUrl, { waitUntil: 'networkidle0' });
  await waitText(outsider, 'not found or you do not have access');
  await outsider.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  await outsider.waitForFunction(() => location.pathname === '/app');
  await shot(outsider, '17-outsider-blocked');
});

await step('Admin (granted only via SQL) can open the admin panel and feature a request', async () => {
  // This is what the owner does once in the Supabase SQL editor:
  const pg = (await import('pg')).default;
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/acilcep_e2e' });
  await db.connect();
  await db.query(`update public.profiles set role = 'admin' where id = (select id from auth.users where email = $1)`, [`other${stamp}@test.local`]);
  await db.end();
  await outsider.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  await outsider.reload({ waitUntil: 'networkidle0' });
  await waitText(outsider, 'Admin panel');
  await waitText(outsider, 'Open requests');
  await click(outsider, 'Requests', { exact: true });
  await waitText(outsider, TITLE);
  await click(outsider, 'Feature', { exact: true });
  await waitText(outsider, 'Unfeature');
  await click(outsider, 'Users', { exact: true });
  await waitText(outsider, SUPPLIER.company);
  await shot(outsider, '20-admin-panel');
});

await step('Logged-out visitor is sent to sign in', async () => {
  const anon = await newPhone('anon');
  await anon.goto(`${BASE}/orders`, { waitUntil: 'networkidle0' });
  await anon.waitForFunction(() => location.pathname === '/login');
});

await step('Sign out and sign in again with email + password', async () => {
  await buyer.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' });
  await click(buyer, 'Sign out', { exact: true });
  await buyer.waitForFunction(() => ['/', '/login'].includes(location.pathname));
  await buyer.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await fill(buyer, 'Email', BUYER.email);
  await fill(buyer, 'Password', 'wrong-password');
  await click(buyer, 'Sign in', { exact: true });
  await waitText(buyer, 'Email or password is wrong');
  await fill(buyer, 'Password', 'Passw0rd!x');
  await click(buyer, 'Sign in', { exact: true });
  await waitText(buyer, 'My requests');
  await waitText(buyer, TITLE);
  await shot(buyer, '18-buyer-home');
});

await step('Turkish UI inside the app', async () => {
  await buyer.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.trim() === 'TR')?.click());
  await waitText(buyer, 'İlanlarım');
  await shot(buyer, '19-buyer-home-tr');
});

await browser.close();
console.log('\nACİLCEP end-to-end test (Chrome, 412×915 Android phone viewport)\n' + results.join('\n'));
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
