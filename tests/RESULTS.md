# ACİLCEP – Test results

Run on 2026-11-20 in the development workspace.

## 1. Database, security (RLS) and business flow – `npm run test:db`

Runs the real `supabase/setup.sql` on PostgreSQL 16 and acts as real API roles (`anon` / `authenticated`).

```
  ✔ Sign-up creates profiles with the requested role
  ✔ Sign-up metadata cannot create an admin
  ✔ User cannot make themselves admin / change protected fields
  ✔ User can edit own normal profile fields
  ✔ Users cannot read other users' private profiles
  ✔ Anonymous visitors cannot read profiles or requests, but can read categories
  ✔ Buyer creates a request; forged fields are ignored
  ✔ Matching suppliers are notified about a new request
  ✔ Suppliers cannot create requests
  ✔ Request visibility: owner + real suppliers yes; other buyer and demo users no
  ✔ Supplier sends an offer; forged status/currency are ignored
  ✔ Buyer is notified about the new offer
  ✔ Demo supplier cannot offer on real requests; buyers cannot offer
  ✔ Offer visibility: own supplier + request owner only
  ✔ Suppliers can only change their own offers, and cannot accept them
  ✔ Only the request owner can accept an offer
  ✔ Buyer accepts an offer: order created, other offers rejected, request awarded
  ✔ An offer cannot be accepted twice; closed offers cannot be edited
  ✔ Supplier still sees a request they offered on after it closed
  ✔ Order visibility: only buyer and winning supplier
  ✔ Orders cannot be created or changed directly
  ✔ Order status flow follows the allowed steps
  ✔ Contact details are shared only with the parties of an order
  ✔ Only the buyer of a delivered order can rate the supplier, once
  ✔ Public supplier profile shows rating but never phone/address
  ✔ Messaging rules
  ✔ Notifications are private and cannot be forged
  ✔ Buyer can cancel own open request but not reopen, feature or edit it
  ✔ Demo world is separate: demo data invisible to real users and vice versa
  ✔ Admin rights: only via SQL editor; admin can moderate
  ✔ Complaints: users see only their own; admin resolves
  ✔ Photo upload policy: buyers can only upload into their own folder
  ✔ Supplier products: owner manages, others read only
33 passed, 0 failed
```

## 2. Real app in Chrome on an Android-phone screen (412×915) – `tests/run-e2e.sh`

The real frontend build, driven in Chrome. Backend: the real database schema behind a small **test-only** gateway (`tests/local-backend/`) that imitates the Supabase Auth / REST / Realtime APIs. Screenshots: `tests/screenshots/`.

```
  ✔ Landing page renders (EN default) and switches to Turkish (1803 ms)
  ✔ PWA: manifest, icons and offline service worker are installed (15 ms)
  ✔ Buyer signs up with email and completes profile (1628 ms)
  ✔ Supplier signs up and completes profile (1675 ms)
  ✔ Buyer creates an urgent request (2013 ms)
  ✔ Supplier sees the request in the live feed and gets an alert (1405 ms)
  ✔ Supplier sends an offer (price + delivery time) (546 ms)
  ✔ Offer appears on the buyer screen in real time (no reload) (524 ms)
  ✔ Buyer accepts the offer → order is created (583 ms)
  ✔ Supplier gets "offer accepted" and moves the order forward (1979 ms)
  ✔ Order status changes appear on the buyer screen in real time (96 ms)
  ✔ Buyer rates the supplier (418 ms)
  ✔ Buyer and supplier exchange messages (1794 ms)
  ✔ History: delivered order is listed under History (1450 ms)
  ✔ Public supplier profile shows the new rating (1465 ms)
  ✔ Unauthorized access is blocked (other buyer cannot open request/order) (4620 ms)
  ✔ Admin (granted only via SQL) can open the admin panel and feature a request (2595 ms)
  ✔ Logged-out visitor is sent to sign in (894 ms)
  ✔ Sign out and sign in again with email + password (2348 ms)
  ✔ Turkish UI inside the app (397 ms)
20 passed, 0 failed
```

## 3. What was NOT tested (needs a real Supabase project)

- Supabase's own servers: real sign-up e-mails / confirmation links, password-reset e-mails, the real Realtime server, Storage photo upload. The code uses the standard `supabase-js` calls and the storage RLS policy is tested in SQL, but these were not run against supabase.com.
- Installing the PWA on a physical Android phone (manifest + service worker were verified in Chrome).
- Load / performance under many users.
