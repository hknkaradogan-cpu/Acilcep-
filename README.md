# ACİLCEP – Emergency Supply Network

B2B acil tedarik pazaryeri: işletmeler (otel, restoran, kafe…) acil ihtiyacını yazar, yakındaki tedarikçiler canlı teklif verir, alıcı en iyi teklifi seçer, sipariş teslimata kadar takip edilir.

🌐 **Canlı uygulama:** https://hknkaradogan-cpu.github.io/Acilcep-/
🗄️ **Supabase projesi:** `acilcep` (Frankfurt) – veritabanı, güvenlik kuralları, canlı güncelleme ve fotoğraf deposu kurulu.
🔄 **Güncelleme yayınlamak:** `scripts/deploy-gh-pages.sh`

**Teknoloji:** React + Vite + TypeScript + Tailwind CSS · Supabase (Auth, PostgreSQL, Realtime, Storage) · PWA · Cloudflare Pages. Tamamı ücretsiz planlarla çalışır.

> 🇬🇧 English technical notes are further down: [Developer guide](#developer-guide-english).

---

## Durum (dürüst özet)

| Özellik | Durum |
|---|---|
| E-posta ile kayıt / giriş / şifre sıfırlama | ✅ Yazıldı ve tarayıcıda test edildi (test sunucusuyla) |
| Alıcı / Tedarikçi / Yönetici rolleri | ✅ Yönetici yetkisi uygulamadan **verilemez**, yalnızca Supabase SQL ile |
| Profil: ülke, şehir, işletme, telefon, para birimi | ✅ |
| Kategoriler (13 adet, EN/TR) | ✅ |
| Acil ihtiyaç ilanı: miktar, açıklama, fotoğraf, teslimat adresi, süre, bütçe | ✅ (fotoğraf yükleme gerçek Supabase'de denenmedi) |
| Canlı ilan akışı ve canlı teklifler (Realtime) | ✅ Uygulama tarafı test edildi; gerçek Supabase Realtime sunucusunda denenmedi |
| Teklif: fiyat + teslimat süresi + not, düzenleme, geri çekme | ✅ |
| Teklif karşılaştırma (fiyat / hız), kabul / ret | ✅ |
| Sipariş durumu: Onaylandı → Hazırlanıyor → Yolda → Teslim edildi / İptal | ✅ |
| Mesajlaşma (ilan bazında, canlı) | ✅ |
| Uygulama içi bildirimler (canlı rozet) | ✅ Telefon kapalıyken bildirim (push) **yok** |
| Tedarikçi puanlama ve yorum | ✅ |
| İşlem geçmişi | ✅ Siparişler > Geçmiş |
| Yönetici paneli: istatistik, kullanıcı askıya alma, ilan öne çıkarma/iptal, şikâyet çözme | ✅ |
| Şikâyet bildirme (ilan, kullanıcı, sipariş) | ✅ |
| İngilizce (varsayılan) + Türkçe | ✅ |
| Para birimleri (51 adet) – **kur çevirisi yok**, alıcının seçtiği para birimi kullanılır | ✅ |
| Demo hesaplar gerçek kullanıcılardan ayrı | ✅ Veritabanı kurallarıyla zorunlu |
| Tedarikçi paketleri | ⚠️ Yalnızca **demo** gösterim. Ödeme sistemi yok, ücret alınmaz |
| Öne çıkarılmış ilanlar | ⚠️ Yalnızca yönetici elle öne çıkarabilir; satın alma yok |
| Komisyon | ❌ Henüz yok |
| PWA (telefona yükleme, çevrimdışı açılış) | ✅ Manifest + servis çalışanı Chrome'da doğrulandı |

Test sonuçları: [`tests/RESULTS.md`](tests/RESULTS.md) — veritabanı/güvenlik 33/33, telefon ekranında uçtan uca 20/20.

---

## Kurulum (telefondan yapılabilir)

Toplam 3 ücretsiz hesap gerekir: **GitHub**, **Supabase**, **Cloudflare**.

### 1) Supabase veritabanını kur (≈5 dk)

1. <https://supabase.com> → **Start your project** → GitHub ile giriş yapın.
2. **New project** → ad: `acilcep`, bir veritabanı şifresi belirleyin (bir yere kaydedin), bölge: size en yakın (ör. *Frankfurt*). **Create**.
3. Proje hazır olunca soldaki menüden **SQL Editor** → **New query**.
4. Bu depodaki [`supabase/setup.sql`](supabase/setup.sql) dosyasını açın → tamamını kopyalayın → SQL Editor'e yapıştırın → **Run**. "Success" görmelisiniz. (Tekrar çalıştırmak güvenlidir.)
5. **Authentication → Sign In / Providers → Email**:
   - Başlangıç için **"Confirm email"** seçeneğini **kapatın**. Sebep: Supabase'in ücretsiz yerleşik e-posta servisi saatte yalnızca 2 e-posta gönderir ve sadece sizin Supabase ekibinizdeki adreslere ulaşır. Kapalıyken kullanıcılar kayıttan hemen sonra giriş yapar.
   - Gerçek kullanıcılara açılırken ücretsiz bir SMTP servisi (ör. Resend, Brevo) bağlayıp **Confirm email**'i tekrar açmanız önerilir: **Authentication → Emails → SMTP Settings**.
6. **Project Settings → API** (veya **Data API**) sayfasından iki değeri kopyalayın:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`
   - ⚠️ **service_role / secret** anahtarını asla hiçbir yere yazmayın.

### 2) Cloudflare Pages'te yayınla (≈5 dk)

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → GitHub'daki `acilcep` deposunu seçin.
2. Ayarlar:
   - Framework preset: **Vite** (yoksa *None*)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Environment variables** bölümüne ekleyin:
   - `VITE_SUPABASE_URL` = (1. adımdaki Project URL)
   - `VITE_SUPABASE_ANON_KEY` = (1. adımdaki anon key)
   - `NODE_VERSION` = `22`
4. **Save and Deploy**. Bitince `https://acilcep-xxx.pages.dev` gibi bir adres verir.
5. Supabase'e dönün: **Authentication → URL Configuration** → **Site URL** = bu adres; **Redirect URLs**'e `https://ADRESİNİZ/**` ekleyin (şifre sıfırlama bağlantıları için).

> Ortam değişkenlerini sonradan değiştirirseniz Cloudflare'de **Deployments → Retry deployment** yapın; değerler derleme sırasında uygulamaya eklenir.

### 3) Kendinizi yönetici yapın

1. Yayındaki uygulamada normal bir hesap açın.
2. Supabase → **SQL Editor** → şunu kendi e-postanızla çalıştırın:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'SIZIN@EPOSTANIZ.com');
```

3. Uygulamada çıkış yapıp tekrar girin → alt menüde **Admin / Yönetim** görünür.

### 4) Android telefona uygulama olarak yükleme

1. Telefonda **Chrome** ile uygulama adresini açın.
2. Sağ üstteki **⋮** menüsü → **Uygulamayı yükle** (veya **Ana ekrana ekle**) → **Yükle**.
3. Ana ekranda kırmızı **ACİLCEP** simgesi belirir; normal bir uygulama gibi tam ekran açılır.
4. Alternatif: Uygulamada **Profil** sayfasındaki **📲 Uygulamayı yükle** düğmesi (Chrome izin verdiğinde görünür).

### Demo / test hesapları

Kayıt ekranındaki **"Bu bir test / demo hesabı"** kutusunu işaretleyerek açılan hesaplar sadece diğer demo hesapları görür. Gerçek kullanıcılar demo ilanları, teklifleri, profilleri görmez — ve tersi. Bu ayrım veritabanı kurallarıyla zorunludur.

---

## Developer guide (English)

### Run locally

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm run build             # type-check + production build into dist/
```

Requires Node 20.19+ (22 recommended, see `.nvmrc`).

### Project structure

```
supabase/
  migrations/0001_schema.sql            tables, enums, indexes
  migrations/0002_functions.sql         helper functions, guard triggers, notifications, RPCs, public_profiles view
  migrations/0003_rls.sql               Row Level Security policies + grants
  migrations/0004_seed_realtime_storage.sql  categories, realtime publication, photo bucket + policies
  setup.sql                             all of the above in one file (npm run db:bundle)
  tests/rls.test.mjs                    33 database / security tests (npm run test:db)
src/
  lib/        supabase client, auth + data context, i18n (EN/TR), types, formatting, realtime hook
  components/ layout (bottom navigation), UI kit, request card, status badges, report button
  pages/      Landing, Auth, Home (buyer / supplier feed), NewRequest, RequestDetail, Orders,
              Messages/Chat, Notifications, Profile (products, demo plans), SupplierPublic, Admin
public/       favicon, PWA icons, _redirects (SPA routing on Cloudflare Pages)
tests/        e2e.mjs (Chrome, phone viewport), local-backend/ (TEST-ONLY Supabase stand-in), screenshots
```

### Security model

- **RLS is enabled on every table**; anything not explicitly allowed is denied. `anon` can only read categories.
- Profiles are private (own row / admin). Other users are shown through the `public_profiles` view, which never exposes phone, address or e-mail. Phone and address are revealed only to the two parties of an accepted order (`get_order_contact`).
- **Guard triggers** stop clients from changing protected columns: `role`, `plan`, `is_demo`, `is_suspended`, request/offer ownership and status, currency, etc. Forged values on insert are overwritten (owner = `auth.uid()`, offer currency = request currency, status = open/pending).
- State changes that touch several rows run in `SECURITY DEFINER` functions that check the caller: `accept_offer`, `reject_offer`, `update_order_status` (allowed transitions per role), `admin_*`.
- **Admin cannot be granted from the client** — sign-up metadata `role: "admin"` becomes `buyer`; even admins cannot change roles in the app. Only the SQL editor can.
- Suppliers see open requests only of their own world (real vs demo) and only their own offers; buyers see offers on their own requests only.
- Only the public anon key is used in the browser. No secrets in the frontend.
- Realtime uses `postgres_changes`, which Supabase filters by the same RLS policies.

### Tests

```bash
npm run test:db       # needs a local PostgreSQL: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
tests/run-e2e.sh      # needs PostgreSQL + Chrome (CHROME_PATH); builds the app and drives it on a phone-sized screen
```

`tests/local-backend/gateway.mjs` is a **test-only** imitation of the Supabase HTTP/Realtime APIs on top of the real schema, used because the test machine could not run Supabase itself. It is not part of the app or the deployment.

### Known gaps / roadmap

- Real payments for supplier plans, paid featured listings and commissions (currently demo labels only; nothing is charged).
- Web push notifications when the app is closed (today: in-app notifications + live badges).
- Distance-based matching / map pin for delivery location (today: same country + category matching, text address).
- E-mail notifications for offers/orders; automatic expiry of old requests; multiple photos per request.
- Category management UI for admins (categories are edited in SQL); supplier trial expiry is shown but not enforced.
- Exchange rates are intentionally not implemented: prices are always shown in the currency the buyer chose.
