# ⏱ Donathon Timer

A self-hosted donation-powered countdown timer with real-time integration and OBS overlay support — built for Indonesian streamers on **Sociabuzz**, **Trakteer**, and **Saweria**. Runs entirely on your own PC, no paid hosting needed.

---

## Project structure

```
donathon-timer/
├── public/
│   ├── index.html            # Main timer control UI
│   ├── style.css             # All styles
│   └── app.js                # Timer logic, overlay settings, Socket.IO client
├── server/
│   ├── index.js              # Express + Socket.IO server
│   ├── currency.js           # Exchange rate cache + conversion (ExchangeRate-API)
│   └── webhooks/
│       ├── sociabuzz.js      # ✅ Sociabuzz webhook handler
│       ├── saweria.js        # ✅ Saweria webhook handler
│       └── trakteer.js       # ✅ Trakteer webhook handler
├── overlay/
│   └── index.html            # OBS browser source overlay
├── tunnel/
│   ├── config.yml            # Cloudflare Tunnel config (fill in your tunnel ID)
│   └── config-example.yml    # Reference copy — do not edit
│
├── state.json                # Auto-generated — timer state, do not edit
├── settings.json             # Auto-generated — donation rules from UI
├── donations.json            # Auto-generated — persistent donation history
│
├── .env                      # Your secrets — never share or commit this
├── .env.example              # Template — copy to .env and fill in
├── setup.html                # Open in browser to generate your .env
├── CLOUDFLARE_SETUP.md       # Step-by-step Cloudflare tunnel guide
└── README.md
```

---

## Tech stack

| Layer | Tool |
|---|---|
| Timer UI | HTML + CSS + Vanilla JS |
| Server | Node.js + Express |
| Real-time | Socket.IO |
| State persistence | `state.json` — written every second |
| Settings persistence | `settings.json` — written on Save |
| Donation history | `donations.json` — persistent, survives refresh |
| Donation platforms | Sociabuzz · Saweria · Trakteer |
| Currency conversion | ExchangeRate-API (hourly cache) |
| Public tunnel | Cloudflare Tunnel (`cloudflared`) |
| OBS | Browser Source → `http://localhost:3000/overlay` |

---

## ⚙️ First-time setup

### 1 — Install Node.js

Download **LTS** from https://nodejs.org and run the installer with all defaults.

Verify:
```
node --version
```
You should see `v20.x.x` or higher.

---

### 2 — Install Cloudflare Tunnel

Download the Windows installer from:
```
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```
Run with all defaults. Verify:
```
cloudflared --version
```

---

### 3 — Install dependencies

Open Command Prompt in the project folder and run:
```
npm install
```

---

### 4 — Create your .env file

Open **`setup.html`** in any browser — just double-click it, no server needed.

Fill in your platform keys, click **Generate .env**, download the zip, extract it, and place the `.env` file in your project folder.

What goes in `.env`:

| Key | Where to find it |
|---|---|
| `PORT` | Leave as `3000` |
| `BASE_CURRENCY` | `IDR`, `USD`, or `MYR` |
| `SOCIABUZZ_TOKEN` | Sociabuzz dashboard → Integrasi → Webhook |
| `SAWERIA_STREAM_KEY` | Your Saweria alert URL: `?streamKey=...` |
| `TRAKTEER_SECRET` | Trakteer dashboard → Integrasi → Webhook |
| `EXCHANGERATE_API_KEY` | https://www.exchangerate-api.com (free tier) |

---

### 5 — Configure your settings

1. Open Command Prompt in the project folder and run `npm start`
2. Open **http://localhost:3000** in your browser
3. Go to the **Settings** tab
4. Set starting timer duration, base currency, and donation rules
5. Click **Save settings**

This writes `settings.json` to disk. Rules survive restarts and power cuts.

> **Do this before testing webhooks.** If `settings.json` doesn't exist yet, the server falls back to built-in defaults which may not match what you want.

---

### 6 — Add OBS Browser Source

1. Open OBS → your scene → **+** under Sources → **Browser**
2. URL: `http://localhost:3000/overlay`
3. Width: `500` · Height: `160`
4. Check **"Shutdown source when not visible"**
5. Check **"Refresh browser when scene becomes active"**

> **Customize the overlay:** Go to the **Overlay Settings** tab → adjust fonts, colors, sizes, glow, background → click **Save overlay** → **Copy URL** → paste that URL into OBS. All settings are baked into the URL.

> **OBS on a different PC?** Use the server machine's local IP instead of `localhost`: `http://192.168.1.X:3000/overlay`. Run `ipconfig` on the server machine to find its IP.

---

## 🌐 Cloudflare Tunnel

The tunnel gives donation platforms a public HTTPS URL to send webhooks to. See **`CLOUDFLARE_SETUP.md`** for the full step-by-step guide.

### Option A — No domain (random URL)

Free, no domain needed. URL changes every restart — update webhook URLs in each platform before every stream.

```bash
npm run stream:quick
```

Webhook URLs (update each stream):
```
https://random-name.trycloudflare.com/webhook/sociabuzz?token=
https://random-name.trycloudflare.com/webhook/saweria
https://random-name.trycloudflare.com/webhook/trakteer
```

---

### Option B — With your own domain (permanent URL) ✅ Recommended

Set webhook URLs once, never touch them again. A `.my.id` domain costs around Rp 30,000–50,000/year.

```bash
npm run stream
```

Webhook URLs (permanent):
```
https://subathon.yourdomain.com/webhook/sociabuzz?token=
https://subathon.yourdomain.com/webhook/saweria
https://subathon.yourdomain.com/webhook/trakteer
```

Follow **`CLOUDFLARE_SETUP.md`** for one-time setup with your registrar.

---

## 💰 Donation platform setup

### Sociabuzz ✅

**Auth method:** Bearer token in `Authorization` header.

1. Sociabuzz dashboard → **Integrasi** → **Webhook**
2. **Webhook URL**: `https://yourdomain.com/webhook/sociabuzz?token=`
3. Copy **Webhook Token** → `.env` → `SOCIABUZZ_TOKEN=`
4. Restart server → click **Webhook HTTP Test**

Terminal should show:
```
[sociabuzz] donation from Jessica — IDR 10.000
[donation] sociabuzz | Jessica | IDR 10000 | total +Xs
```

---

### Saweria ✅

**Auth method:** HMAC-SHA256 signature using your Stream Key.

The signature is computed from: `version + id + amount_raw + donator_name + donator_email`

**Where to find your Stream Key:** it's in your Saweria alert URL:
```
saweria.co/widgets/alert?streamKey=YOUR_KEY_HERE
```

1. Copy Stream Key from alert URL → `.env` → `SAWERIA_STREAM_KEY=`
2. Saweria dashboard → **Integrasi** → **HTTP Webhook**
3. **Webhook URL**: `https://yourdomain.com/webhook/saweria`
4. Restart server → click **Munculkan Notifikasi**

Terminal should show:
```
[saweria] donation from Someguy — IDR 69.420
[donation] saweria | Someguy | IDR 69420 | total +Xs
```

---

### Trakteer ✅

**Auth method:** Token in `X-Webhook-Token` header.

1. Trakteer dashboard → **Integrasi** → **Webhook**
2. **Webhook URL**: `https://yourdomain.com/webhook/trakteer`
3. Copy the token shown → `.env` → `TRAKTEER_SECRET=`
4. Toggle webhook **on** → restart server → click **Send Webhook Test**

Terminal should show:
```
[trakteer] donation from Egis — IDR 5.000 (1× Kopi @ IDR 5000)
[donation] trakteer | Egis | IDR 5000 | total +Xs
```

> **Note:** Trakteer's test button sends a payload with JS-style comments which makes it invalid JSON. The handler strips these automatically so the test works. Real donations don't have this issue.

> **Important:** Trakteer retries failed webhooks 3 times, then **automatically disables** your webhook. Always make sure your server is running before testing.

---

## 💱 Currency conversion

When a donation arrives in a currency different from your `BASE_CURRENCY`, the server automatically converts it before applying your donation rules.

**Setup:** Add your free API key from https://www.exchangerate-api.com to `.env`:
```
EXCHANGERATE_API_KEY=your_key_here
```

Rates are fetched once on server start and cached for 1 hour. If the key is missing, the server falls back to the raw donation amount and logs a warning.

The donation log shows both the original amount and the converted amount (e.g. `USD 5 → ≈ IDR 89,545`). You can customize the appearance of the converted amount — size, color, and visibility — in the **Settings** tab under **Donation log appearance**.

---

## 🧮 How donation rules work

Configure in the **Settings** tab → saved to `settings.json`.

Tiered calculation: walks rules highest → lowest, takes full multiples at each tier, passes remainder down.

**Example rules:**
```
IDR  5,000 = +1 minute
IDR 10,000 = +2 minutes
IDR 50,000 = +10 minutes
```

| Donation | Calculation | Time added |
|---|---|---|
| IDR 10,000 | 10k × 1 | **+2 min** |
| IDR 50,000 | 50k × 1 | **+10 min** |
| IDR 60,000 | 50k × 1, then 10k × 1 | **+12 min** |
| IDR 35,000 | 10k × 3, then 5k × 1 | **+7 min** |
| IDR 7,000 | 5k × 1, rem 2k ignored | **+1 min** |
| IDR 4,000 | Below all thresholds | **+0** |

---

## 📋 Donation log

The donation log persists across page refreshes — it's saved to `donations.json` on the server and loaded automatically when you open the control UI. The log keeps the last 500 donations; older entries are trimmed automatically.

Each entry shows: platform badge, donor name, original amount, converted amount (if applicable), time added, and timestamp.

All appearance options — font sizes, colors, row spacing, log height, and which fields to show — are configurable in the **Settings** tab under **Donation log appearance**.

---

## ⚡ Power cut / crash recovery

`state.json` is written every second while running, and immediately on every pause, reset, and donation received.

On restart after a power cut:
```
↺  Restored state — 4521s remaining (was RUNNING)
⚡  Power-cut drift: -47s applied
```

Timer always restores as **PAUSED** — click Start when ready. On a clean Ctrl+C shutdown, exact state is saved with zero drift.

---

## npm scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server only |
| `npm run dev` | Start with auto-restart on file saves |
| `npm run tunnel` | Start Cloudflare Tunnel (permanent URL) |
| `npm run tunnel:quick` | Start tunnel with random URL |
| `npm run stream` | Server + permanent tunnel together |
| `npm run stream:quick` | Server + quick tunnel together |

---

## Build checklist

### Phase 1 — Timer UI ✅
- [x] Countdown display, start/pause/reset
- [x] Manual time addition
- [x] Donation log with platform badge, name, amount, message
- [x] Low-time warning color change
- [x] Settings panel (start time, currency, rules)
- [x] Separated HTML / CSS / JS

### Phase 2 — Local server ✅
- [x] Node.js + Express + Socket.IO
- [x] Server-side timer state (survives browser close)
- [x] `state.json` — written every second, power-cut safe
- [x] `settings.json` — written on Save, rules survive restarts
- [x] `donations.json` — persistent donation history, loaded on page open
- [x] Graceful shutdown on Ctrl+C
- [x] Settings sync endpoint (`POST /api/settings`)

### Phase 3 — Overlay customization ✅
- [x] 30+ Google Fonts + custom font input
- [x] Full color control (digits, low, paused, glow, label, status, background)
- [x] Size, padding, radius, opacity sliders
- [x] Transparent background toggle
- [x] Live preview with checkered stage
- [x] Auto-generated OBS URL with all settings as params

### Phase 4 — Cloudflare Tunnel ✅
- [x] Option A — random URL (`npm run stream:quick`)
- [x] Option B — permanent domain (`npm run stream`)
- [x] `CLOUDFLARE_SETUP.md` with full walkthrough

### Phase 5 — Sociabuzz ✅
- [x] Bearer token verification
- [x] Tiered donation-to-time calculation
- [x] Donor name, amount, message in log

### Phase 6 — Saweria ✅
- [x] HMAC-SHA256 signature verification
- [x] Signing: `HMAC(streamKey, version+id+amount_raw+donator_name+donator_email)`
- [x] Stream Key from alert URL

### Phase 7 — Trakteer ✅
- [x] `X-Webhook-Token` header verification
- [x] Comment stripping for test payload compatibility
- [x] `price × quantity` for correct total calculation
- [x] Always returns 200 to prevent auto-disable

### Phase 8 — Setup experience ✅
- [x] `setup.html` — browser-based .env generator, no server needed

### Phase 9 — Currency conversion ✅
- [x] ExchangeRate-API integration (`server/currency.js`)
- [x] Hourly rate cache, pre-warmed on server start
- [x] Converts incoming currency to base currency before rule matching
- [x] Falls back to raw amount if API key missing or request fails
- [x] `/api/rates` endpoint exposes current cached rates

### Phase 10 — Donation log persistence ✅
- [x] `donations.json` written on every donation (capped at 500 entries)
- [x] History loaded via `GET /api/donations` on page open
- [x] Converted amount shown alongside original in log
- [x] Converted amount appearance (size, color, visibility) configurable in Settings

---


## License

MIT
