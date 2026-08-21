# NOTBAD KREASI — Audio Converter

Frontend + Netlify Functions untuk web converter audio dengan login Discord,
sistem limit Free/Pro/Unlimited, dan upload otomatis ke Roblox (Open Cloud)
yang langsung mengembalikan Music/Asset ID.

## Pembagian tanggung jawab (sesuai permintaan)

- **Netlify (sudah dibuatkan di sini):** hosting frontend, login Discord,
  sesi user, sistem limit Free 0/3 per 12 jam, panel owner "Gift Pro/Unlimited",
  penyimpanan kredensial Roblox, dan upload ke Roblox Open Cloud (mengembalikan
  Asset ID musik).
- **VPS kamu sendiri (tidak dibuatkan di sini — sudah kamu punya):** pencarian
  YouTube/SoundCloud, proses import, dan konversi audio (speed/amplify/format/dsb).
  Frontend hanya memanggil endpoint VPS kamu — logika download/convert itu
  sendiri sepenuhnya di sisi kamu.

  > Catatan: saya sengaja tidak menuliskan logika pengunduhan dari YouTube
  > itu sendiri (mis. ekstraksi stream) di sisi saya, karena itu menyentuh
  > wilayah hak cipta/ToS platform — bagian itu saya serahkan sepenuhnya ke
  > backend VPS yang sudah kamu kelola sendiri. Frontend di sini hanya
  > mengirim request ke endpoint yang **kamu** sediakan.

### Kontrak endpoint yang diharapkan dari VPS kamu

Set `window.NOTBAD_VPS_API_BASE` di `index.html` (atau edit `CONFIG.VPS_API_BASE`
di `assets/app.js`) ke alamat VPS kamu, lalu sediakan:

- `GET  {VPS}/search?q=...` → `[{ id, title, channel, thumbnail, url }]`
- `POST {VPS}/import` body `{ url }` → `{ sourceUrl, title }`
- `POST {VPS}/convert` (multipart: `file` atau `sourceUrl`, `settings` JSON) → salah satu dari:
  - **Sinkron** (langsung selesai): `{ downloadUrl }` — progress bar frontend akan
    menampilkan progres upload asli (0–40%), lalu lompat ke ~70% karena tidak
    ada info progres proses di server.
  - **Async / job-based** (disarankan untuk file besar agar progres nyata):
    `{ jobId }`, lalu frontend akan polling
    `GET {VPS}/convert/status/:jobId` setiap ~1.2 detik, sampai server
    membalas `{ status: "processing", progress: 0-100 }` atau
    `{ status: "done", downloadUrl }` atau `{ status: "error", error }`.

### Progress real-time di frontend

`assets/app.js` sudah menampilkan progress bar dengan tahapan:
1. Cek limit (server Netlify) — instan
2. Upload sumber audio ke VPS — progres **asli** dari `XMLHttpRequest.upload.onprogress`
3. Proses konversi di VPS — progres asli jika VPS pakai pola job/`jobId`
   di atas, kalau tidak akan langsung ke ~70%
4. Upload ke Roblox + menunggu Roblox memproses aset — progres disimulasikan
   halus sambil menunggu (karena Roblox Open Cloud tidak mengekspos progres
   granular, hanya status selesai/belum)

## Struktur proyek

```
index.html
assets/style.css
assets/app.js
netlify/functions/
  discord-login.js       # redirect ke OAuth Discord
  discord-callback.js    # tukar code → sesi login (cookie)
  me.js                  # info user + status limit saat ini
  logout.js
  gift-pro.js            # khusus OWNER_DISCORD_IDS
  track-convert.js       # enforce limit Free 3/12 jam
  roblox-connect.js      # simpan Roblox User/Group ID + API Key
  roblox-upload.js       # upload ke Roblox Open Cloud → Asset ID
  _lib/session.js         # cookie sesi ter-signed (HMAC)
  _lib/store.js            # penyimpanan data user (Netlify Blobs)
netlify.toml
package.json
```

## Environment variables (isi di Netlify → Site settings → Environment variables)

| Variable | Keterangan |
|---|---|
| `DISCORD_CLIENT_ID` | Client ID aplikasi Discord (developer portal) |
| `DISCORD_CLIENT_SECRET` | Client Secret aplikasi Discord |
| `DISCORD_REDIRECT_URI` | `https://<domain-netlify-kamu>/.netlify/functions/discord-callback` — daftarkan juga persis di Discord Developer Portal → OAuth2 → Redirects |
| `OWNER_DISCORD_IDS` | Discord User ID owner, pisahkan koma jika lebih dari satu. Cuma ID ini yang bisa akses Panel Owner (Gift Pro/Unlimited) |
| `SESSION_SECRET` | String acak panjang (mis. `openssl rand -hex 32`) untuk menandatangani cookie sesi |

Tidak perlu database eksternal — user, tier Pro/Unlimited, dan penghitung limit
disimpan otomatis lewat **Netlify Blobs** (built-in, tidak perlu setup tambahan).

## Setup Discord OAuth

1. Buat aplikasi di https://discord.com/developers/applications
2. OAuth2 → Redirects → tambahkan `DISCORD_REDIRECT_URI` di atas
3. Scope yang dipakai: `identify` (ambil username & avatar saja)
4. Salin Client ID & Client Secret ke environment variables Netlify

## Cara kerja Roblox Open Cloud upload

1. User mengisi Roblox User ID (atau Group ID) + API Key di kartu "Roblox Open
   Cloud Upload", lalu klik **Hubungkan & Simpan** → tersimpan di record user
   (lihat catatan keamanan di `roblox-connect.js`, disarankan dienkripsi untuk
   produksi).
2. API Key harus dibuat di https://create.roblox.com/dashboard/credentials
   dengan izin **Assets: Write** (dan Read) untuk User/Group yang dipilih.
3. Saat klik **Konversi Audio**: hasil konversi dari VPS diunggah otomatis ke
   `POST https://apis.roblox.com/assets/v1/assets` (assetType `Audio`),
   fungsi menunggu proses Roblox selesai, lalu Asset/Music ID langsung
   ditampilkan + tombol salin.

## Limit Free / Pro / Unlimited

- Free: 3 konversi per 12 jam (reset otomatis per user, dihitung server-side
  supaya tidak bisa dicurangi lewat localStorage).
- Pro / Unlimited: diberikan lewat **Panel Owner** di halaman utama (hanya
  tampil untuk ID di `OWNER_DISCORD_IDS`) — isi Discord User ID target dan
  pilih tier.

## Menjalankan lokal

```bash
npm install
npx netlify dev
```

## Deploy

Push folder ini ke repo Git lalu hubungkan ke Netlify, atau `netlify deploy --prod`
langsung dari folder ini. Jangan lupa isi environment variables sebelum deploy.
