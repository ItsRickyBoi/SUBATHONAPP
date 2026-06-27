⏱ Subathon Timer

A self-hosted subathon countdown timer with real-time donation integration and OBS overlay support — built for Indonesian streamers on **Sociabuzz**, **Trakteer**, and **Saweria**. Runs entirely on your own PC.

---

## Project structure

```
subathon-timer/
├── public/
│   ├── index.html            # Main timer control UI
│   ├── style.css             # All styles
│   └── app.js                # Timer logic, overlay settings, Socket.IO client
├── server/
│   ├── index.js              # Express + Socket.IO server
│   └── webhooks/
│       ├── sociabuzz.js      # ✅ Sociabuzz webhook handler
│       ├── saweria.js        # ✅ Saweria webhook handler
│       └── trakteer.js       # (Phase 7 — coming)
├── overlay/
│   └── index.html            # OBS browser source overlay
├── tunnel/
│   └── config.yml            # Cloudflare Tunnel config
│
├── state.json                # ← auto-generated, do not edit manually
├── settings.json             # ← auto-generated when you click Save Settings
├── donations.json            # ← auto-generated, donation history log
│
├── .env                      # Your secrets — never commit this
├── .env.example              # Template — copy this to .env
├── .gitignore
├── package.json
├── setup.bat                 # First-time setup script
├── start.bat                 # Start with permanent Cloudflare URL
├── start-quick.bat           # Start with random Cloudflare URL (no domain)
├── CLOUDFLARE_SETUP.md       # Step-by-step Cloudflare + Rumahweb guide
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
| Donation log | `donations.json` — written on each donation |
| Donation platforms | Sociabuzz (Bearer token) · Saweria (HMAC-SHA256) · Trakteer (coming) |
| Currency conversion | ExchangeRate-API — Phase 7 |
| Public tunnel | Cloudflare Tunnel (`cloudflared`) |
| OBS | Browser Source → `http://localhost:3000/overlay` |

---

## ⚙️ First-time setup

### 1 — Install Node.js

Download **LTS** from https://nodejs.org and run the installer with all defaults.

Verify: `node --version` → should show `v20.x.x` or higher.

Or just run **`setup.bat`** — it checks Node.js and cloudflared for you and runs `npm install` automatically.

---

### 2 — Install dependencies

```bash
npm install
```

---

### 3 — Create your .env file

```bash
copy .env.example .env
```

Open `.env` and fill in at minimum:
```env
PORT=3000
BASE_CURRENCY=IDR
```

Add platform keys as you set them up (see donation platform sections below).

---

### 4 — Configure your settings

1. Run `npm start`
2. Open http://localhost:3000
3. Go to **Settings** tab
4. Set your starting time, base currency (IDR), and donation rules
5. Click **Save settings**

This writes `settings.json` to disk. The server reads it immediately — rules survive restarts and power cuts from this point on.

> **Do this before testing any webhooks.** If `settings.json` doesn't exist yet,
> the server falls back to built-in default rules which may not match what you want.

---

### 5 — Add the OBS Browser Source

1. Open OBS → your scene → **+** under Sources → **Browser**
2. URL: `http://localhost:3000/overlay`
3. Width: `500` Height: `160`
4. Check **"Shutdown source when not visible"**
5. Check **"Refresh browser when scene becomes active"**

> **Customize the overlay:** Go to **Overlay Settings** tab → adjust fonts, colors,
> sizes, glow, background → **Save overlay** → **Copy URL** → paste into OBS.
> All settings are baked into the URL so OBS always loads your exact look.

> **Running OBS on a different PC?** Use that machine's local IP instead of
> `localhost`: `http://192.168.1.X:3000/overlay`. Run `ipconfig` on the server
> machine to find its IP.

---

## 🌐 Cloudflare Tunnel

The tunnel gives donation platforms a public HTTPS URL to send webhooks to.
See **`CLOUDFLARE_SETUP.md`** for the full Windows + Rumahweb walkthrough.

### Option A — No domain (random URL, free)

URL changes every restart. Update webhook URLs in each platform before each stream.

```bash
start-quick.bat       # Windows — starts server + tunnel together
# or
npm run stream:quick
```

Webhook URLs (update before each stream):
```
https://RANDOM.trycloudflare.com/webhook/sociabuzz
https://RANDOM.trycloudflare.com/webhook/saweria
```

### Option B — With domain (permanent URL) ✅ Your setup

Domain: **subathon.subatonappricky.my.id** — set once, never touch again.

```bash
start.bat       # Windows — starts server + tunnel together
# or
npm run stream
```

Permanent webhook URLs:
```
https://subathon.subatonappricky.my.id/webhook/sociabuzz
https://subathon.subatonappricky.my.id/webhook/saweria
```

---

## 💰 Donation platform setup

### Sociabuzz ✅

**How it works:** Sociabuzz sends a Bearer token in every request header.
Your server checks it matches `SOCIABUZZ_TOKEN` in `.env`. Mismatched requests are rejected.

**Setup:**
1. Sociabuzz dashboard → **Integrasi** → **Webhook**
2. **Webhook URL**: `https://subathon.subatonappricky.my.id/webhook/sociabuzz`
3. Copy the **Webhook Token** → `.env` → `SOCIABUZZ_TOKEN=paste_here`
4. Restart server
5. Click **Webhook HTTP Test** — terminal should show:
   ```
   [sociabuzz] donation from Jessica — IDR 10.000
   [donation] sociabuzz | Jessica | IDR 10000 | total +Xs
   ```

**Payload fields used:**
- `supporter` — donor name
- `amount` — donation amount (IDR)
- `message` — donor message
- `status` — must be `SUCCESS` to process

---

### Saweria ✅

**How it works:** Saweria signs every request using HMAC-SHA256. The signature
is computed from specific payload fields joined together, using your Stream Key.
No separate secret needed — the Stream Key from your alert URL is the signing key.

**Signature method** (from https://saweria.co/docs/webhook):
```
msg       = version + id + amount_raw + donator_name + donator_email
signature = HMAC-SHA256(key=streamKey, msg=msg)
```

**Where to find your Stream Key:**
Go to your Saweria alert URL — it looks like:
```
https://saweria.co/widgets/alert?streamKey=9c21dbd5c0228152a39428076793dd04
```
The value after `streamKey=` is your key.

**Setup:**
1. Copy your Stream Key from the alert URL
2. `.env` → `SAWERIA_STREAM_KEY=your_stream_key_here`
3. Saweria dashboard → **Integrasi** → **HTTP Webhook**
4. **Webhook URL**: `https://subathon.subatonappricky.my.id/webhook/saweria`
5. Restart server
6. Click **Munculkan Notifikasi** — terminal should show:
   ```
   [saweria] raw payload: { ... }
   [saweria] donation from Someguy — IDR 69.420
   [donation] saweria | Someguy | IDR 69420 | total +Xs
   ```

**Payload fields used:**
- `donator_name` — donor name
- `amount_raw` — donation amount in IDR (before platform cut)
- `message` — donor message
- `type` — must be `donation` to process

---

### Trakteer
*(Phase 7 — coming next)*

---

## 🧮 How donation rules work

Configure rules in the **Settings** tab → saved to `settings.json`.

The server uses **tiered calculation** — walks rules highest → lowest, takes full
multiples at each tier, passes remainder down.

**Example rules:**
```
IDR  5,000 = +1 minute
IDR 10,000 = +2 minutes
IDR 50,000 = +10 minutes
```

**Example donations:**

| Donation | Calculation | Time added |
|---|---|---|
| IDR 10,000 | 10k × 1 = +2min | **+2 min** |
| IDR 50,000 | 50k × 1 = +10min | **+10 min** |
| IDR 60,000 | 50k × 1 = +10min, 10k × 1 = +2min | **+12 min** |
| IDR 35,000 | 10k × 3 = +6min, 5k × 1 = +1min | **+7 min** |
| IDR 7,000 | 5k × 1 = +1min, rem 2k ignored | **+1 min** |
| IDR 4,000 | Below all thresholds | **+0** |

---

## ⚡ Power cut / crash recovery

`state.json` is written every second while running, and immediately on every
pause, reset, and time-add.

On restart after a power cut:
```
↺  Restored state — 4521s remaining (was RUNNING)
⚡  Power-cut drift: -47s applied
```

The server calculates how long power was out and subtracts that from remaining
time. Timer always restores as **PAUSED** — you click Start to resume.

On a clean `Ctrl+C` shutdown, exact state is saved with zero drift.

---

## npm scripts reference

| Command | What it does |
|---|---|
| `npm start` | Start the server only |
| `npm run dev` | Start with auto-restart on file saves |
| `npm run tunnel` | Start Cloudflare Tunnel (permanent URL, Option B) |
| `npm run tunnel:quick` | Start tunnel with random URL (Option A) |
| `npm run stream` | Server + permanent tunnel (Option B) |
| `npm run stream:quick` | Server + quick tunnel (Option A) |

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
- [x] `donations.json` — persistent donation history (max 500 entries)
- [x] Graceful shutdown on Ctrl+C
- [x] Settings sync endpoint (`POST /api/settings`)

### Phase 3 — Overlay customization ✅
- [x] 30+ Google Fonts + custom font input (any Google Font name)
- [x] Color pickers: digits, low-time, paused, glow, label, status, background
- [x] Sliders: digit size, label size, status size, glow intensity,
      background opacity, border radius, padding
- [x] Transparent background toggle
- [x] Live preview with checkered stage
- [x] Auto-generated OBS URL with all settings as URL params

### Phase 4 — Cloudflare Tunnel ✅
- [x] `cloudflared` installed on Windows
- [x] Tunnel created: `subathon`
- [x] Permanent domain: `subathon.subatonappricky.my.id`
- [x] Option A (quick): `npm run tunnel:quick` / `start-quick.bat`
- [x] Option B (permanent): `npm run tunnel` / `start.bat`

### Phase 5 — Sociabuzz ✅
- [x] Webhook handler at `POST /webhook/sociabuzz`
- [x] Bearer token verification (constant-time compare)
- [x] Correct field mapping (`supporter` for name)
- [x] Tiered donation-to-time calculation
- [x] Donor message shown in log
- [x] Tested with HTTP Test button ✓

### Phase 6 — Saweria ✅
- [x] Webhook handler at `POST /webhook/saweria`
- [x] HMAC-SHA256 signature verification
- [x] Correct signing method: `HMAC(streamKey, version+id+amount_raw+donator_name+donator_email)`
- [x] Stream Key sourced from alert URL (`?streamKey=...`)
- [x] Tested with Munculkan Notifikasi button ✓

### Phase 7 — Trakteer
- [ ] Webhook handler + signature verification
- [ ] Wire into `processDonation()`
- [ ] Test with Trakteer test button

### Phase 8 — Currency conversion
- [ ] ExchangeRate-API integration
- [ ] Hourly rate cache
- [ ] Convert incoming currency to base (IDR) before rule matching

---
