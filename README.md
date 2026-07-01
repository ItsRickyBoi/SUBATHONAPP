# ⏱ Donathon Timer

A self-hosted donation-powered countdown timer with real-time integration and OBS overlay support. Works with streamer on any platform — supports **Sociabuzz**, **Saweria**, **Trakteer**, and **Ko-fi** out of the box.

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
│       ├── sociabuzz.js      # Sociabuzz
│       ├── saweria.js        # Saweria
│       ├── trakteer.js       # Trakteer
│       └── kofi.js           # Ko-fi
├── overlay/
│   └── index.html            # OBS browser source overlay
├── tunnel/
│   ├── config.yml            # Cloudflare Tunnel config (fill in your tunnel ID)
│   └── config-example.yml    # Reference — do not edit
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
| Donation history | `donations.json` — persistent, capped at 500 entries |
| Donation platforms | Sociabuzz · Saweria · Trakteer · Ko-fi |
| Currency conversion | ExchangeRate-API (hourly cache) |
| Public tunnel | Cloudflare Tunnel (`cloudflared`) |
| OBS | Browser Source → `http://localhost:3000/overlay` |

---

## ⚙️ First-time setup

### 1 — Install Node.js

Download **LTS** from https://nodejs.org and run the installer with all defaults.

Verify: `node --version` → should show `v20.x.x` or higher.

---

### 2 — Install Cloudflare Tunnel

Download the Windows installer from:
```
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```
Run with all defaults. Verify: `cloudflared --version`

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

| Key | Where to find it |
|---|---|
| `PORT` | Leave as `3000` |
| `BASE_CURRENCY` | Your currency (USD, IDR, EUR, etc.) |
| `EXCHANGERATE_API_KEY` | https://www.exchangerate-api.com (free) |
| `SOCIABUZZ_TOKEN` | Sociabuzz → Integrasi → Webhook |
| `SAWERIA_STREAM_KEY` | Your Saweria alert URL: `?streamKey=...` |
| `TRAKTEER_SECRET` | Trakteer → Integrasi → Webhook |
| `KOFI_TOKEN` | Ko-fi → More → API → Webhooks → Verification Token |

---

### 5 — Configure your settings

1. Run `npm start` in the project folder
2. Open **http://localhost:3000**
3. Go to the **Settings** tab
4. Set starting timer duration, base currency, and donation rules
5. Click **Save settings**

> **Do this before testing webhooks.** Without `settings.json`, the server falls back to built-in defaults.

---

### 6 — Add OBS Browser Source

1. OBS → your scene → **+** → **Browser**
2. URL: `http://localhost:3000/overlay`
3. Width: `500` · Height: `160`
4. Check **"Shutdown source when not visible"**
5. Check **"Refresh browser when scene becomes active"**

> **Customize:** Go to **Overlay Settings** tab → adjust fonts, colors, sizes, background → **Save overlay** → **Copy URL** → paste into OBS.

> **OBS on a different PC?** Use `http://192.168.1.X:3000/overlay` (run `ipconfig` to find the server's local IP).

---

## 🌐 Cloudflare Tunnel

Gives donation platforms a public HTTPS URL to reach your server. See **`CLOUDFLARE_SETUP.md`** for the full walkthrough.

### Option A — No domain (random URL)

Free, no domain needed. URL changes every restart — update webhook URLs in each platform before each stream.

```bash
npm run stream:quick
```

### Option B — With your own domain ✅ Recommended

Permanent URL — set webhook URLs once, never touch them again.

```bash
npm run stream
```

Your webhook URLs will be:
```
https://subathon.yourdomain.com/webhook/sociabuzz
https://subathon.yourdomain.com/webhook/saweria
https://subathon.yourdomain.com/webhook/trakteer
https://subathon.yourdomain.com/webhook/kofi
```

---

## 💰 Donation platform setup

### Sociabuzz ✅
**Auth:** Bearer token in `Authorization` header.

1. Sociabuzz → **Integrasi** → **Webhook**
2. Webhook URL: `https://yourdomain.com/webhook/sociabuzz`
3. Copy Webhook Token → `.env` → `SOCIABUZZ_TOKEN=`
4. Restart server → click **Webhook HTTP Test**

---

### Saweria ✅
**Auth:** HMAC-SHA256 signature. Stream Key is in your alert URL: `?streamKey=YOUR_KEY`

1. Copy Stream Key → `.env` → `SAWERIA_STREAM_KEY=`
2. Saweria → **Integrasi** → **HTTP Webhook**
3. Webhook URL: `https://yourdomain.com/webhook/saweria`
4. Restart server → click **Munculkan Notifikasi**

---

### Trakteer ✅
**Auth:** Token in `X-Webhook-Token` header. Plain URL, no token in the URL itself.

1. Trakteer → **Integrasi** → **Webhook**
2. Webhook URL: `https://yourdomain.com/webhook/trakteer`
3. Copy token → `.env` → `TRAKTEER_SECRET=`
4. Restart server → toggle webhook on → click **Send Webhook Test**

> Trakteer's test payload contains JS-style comments — the handler strips them automatically. Real donations are fine.
> Trakteer disables your webhook after 3 failed deliveries — always have the server running before testing.

---

### Ko-fi ✅
**Auth:** Verification token embedded inside the payload itself (not a header).

Ko-fi sends donations as `application/x-www-form-urlencoded` — different from the others.
The actual data is a JSON string in a field called `data`.

1. Ko-fi → **More** → **API** → **Webhooks**
2. Copy your **Verification Token** → `.env` → `KOFI_TOKEN=`
3. Webhook URL: `https://yourdomain.com/webhook/kofi`
4. Click **Send Test** to verify

> Ko-fi sends amounts in USD by default. If your base currency is different, the currency conversion module will convert it automatically (requires `EXCHANGERATE_API_KEY`).

---

## 💱 Currency conversion

When a donation arrives in a currency different from your `BASE_CURRENCY`, the server converts it automatically before applying your rules.

Get a free API key at https://www.exchangerate-api.com → add to `.env`:
```
EXCHANGERATE_API_KEY=your_key_here
```

Rates are fetched on server start and cached for 1 hour. If the key is missing, the server falls back to the raw amount and logs a warning. You can check current cached rates at `http://localhost:3000/api/rates`.

---

## 🧮 How donation rules work

Configure in **Settings** tab → saved to `settings.json`.

Tiered calculation: walks rules highest → lowest, takes full multiples at each tier, passes remainder down.

**Example rules:**
```
USD  5.00 = +1 minute
USD 10.00 = +2 minutes
USD 50.00 = +10 minutes
```

| Donation | Calculation | Time added |
|---|---|---|
| USD 10 | 10 × 1 | **+2 min** |
| USD 60 | 50 × 1, then 10 × 1 | **+12 min** |
| USD 7 | 5 × 1, rem 2 ignored | **+1 min** |
| USD 3 | Below threshold | **+0** |

---

## ⚡ Power cut / crash recovery

`state.json` is written every second. On restart:
```
↺  Restored state — 4521s remaining (was RUNNING)
⚡  Power-cut drift: -47s applied
```
Timer always restores as **PAUSED**. On clean Ctrl+C, state is saved with zero drift.

---

## 🧪 Testing currency conversion

Use the built-in test endpoint — no real donation needed:

**Browser console** (open http://localhost:3000 first):
```js
fetch('/api/test/donation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Test', amount: 5, currency: 'USD', platform: 'test' })
}).then(r => r.json()).then(console.log)
```

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/test/donation" -Method POST -ContentType "application/json" -Body '{"name":"Test","amount":5,"currency":"USD","platform":"test"}'
```

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
- [x] `donations.json` — persistent history, loaded on page open
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

### Phase 7 — Trakteer ✅
- [x] `X-Webhook-Token` header verification
- [x] Comment stripping for test payload compatibility
- [x] `price × quantity` for correct total

### Phase 8 — Ko-fi ✅
- [x] `application/x-www-form-urlencoded` body parsing (different from other platforms)
- [x] JSON string in `data` field parsed correctly
- [x] Verification token matched from inside the payload
- [x] `amount` parsed from string to number
- [x] Supports both `Donation` and `Subscription` types

### Phase 9 — Currency conversion ✅
- [x] ExchangeRate-API integration (`server/currency.js`)
- [x] Hourly cache, pre-warmed on server start
- [x] Converts to base currency before rule matching
- [x] Graceful fallback if API key missing or request fails
- [x] `/api/rates` endpoint for cache inspection
- [x] `/api/test/donation` endpoint for local testing

### Phase 10 — Setup experience ✅
- [x] `setup.html` — browser-based .env generator, no server needed
- [x] Supports all 4 platforms + currency key
- [x] Downloads as `.env` inside a zip (avoids browser filename restrictions)

---

## Prompt context (for AI-assisted development)

> Self-hosted donation-powered countdown timer for streamers. Node.js + Express +
> Socket.IO on Windows PC. Timer state in state.json (written every second,
> drift-corrected on restart). Rules in settings.json (synced from UI via
> POST /api/settings). UI in public/, OBS overlay in overlay/ — both via Socket.IO.
> Overlay customizable via 30+ Google Fonts and URL params.
> Exposed via Cloudflare Tunnel — Option A (random) or Option B (permanent domain).
> Platforms: Sociabuzz (Bearer token), Saweria (HMAC-SHA256, stream key from alert URL),
> Trakteer (X-Webhook-Token, strips JS comments from test payload, price×quantity),
> Ko-fi (urlencoded body, JSON in "data" field, token inside payload, amount is string).
> Currency conversion via ExchangeRate-API (server/currency.js, hourly cache).
> handleDonation() is async (handles conversion), calls sync processDonation() for rule
> matching. Tiered calc: walk rules highest to lowest, full multiples, remainder cascades.
> Test endpoint: POST /api/test/donation for simulating foreign currency donations.

---

## License

MIT
