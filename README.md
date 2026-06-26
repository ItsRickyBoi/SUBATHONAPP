# ⏱ Subathon Timer

A self-hosted subathon countdown timer with real-time donation integration and OBS overlay support — built for streamers with donation service **Sociabuzz**, **Trakteer**, and **Saweria** (for now). Runs entirely on your own PC.

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
│       ├── trakteer.js       # (Phase 6 — coming)
│       └── saweria.js        # (Phase 6 — coming)
├── overlay/
│   └── index.html            # OBS browser source overlay
├── tunnel/
│   └── config.yml            # Cloudflare Tunnel config (permanent URL setup)
│
├── state.json                # ← auto-generated, do not edit
├── settings.json             # ← auto-generated when you click Save Settings
│
├── .env                      # Your secrets — never commit this
├── .env.example              # Template — copy this to .env
├── .gitignore
├── package.json
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
| Donation platforms | Sociabuzz (webhook) · Trakteer (webhook) · Saweria (WebSocket) |
| Currency conversion | ExchangeRate-API — Phase 6 |
| Public tunnel | Cloudflare Tunnel (`cloudflared`) |
| OBS | Browser Source → `http://localhost:3000/overlay` |

---

##  First-time setup

### 1 — Install Node.js

Download the **LTS** version from https://nodejs.org and run the installer with all defaults.

Verify:
```
node --version
```
You should see `v20.x.x` or higher.

---

### 2 — Download / clone the project

```bash
git clone https://github.com/YOUR_USERNAME/SUBATHONAPP.git
cd subathon-timer
```

Or download the ZIP and extract it, e.g. to `C:\SUBATHONAPP`.

---

### 3 — Install dependencies

```bash
npm install
```

| Package | What it does |
|---|---|
| `express` | Web server — serves the UI and API |
| `socket.io` | Real-time bridge between server and browsers |
| `dotenv` | Loads `.env` so secrets aren't hardcoded |
| `nodemon` *(dev)* | Auto-restarts server on file save |
| `concurrently` *(dev)* | Starts server + tunnel in one command |

---

### 4 — Create your .env file

```bash
# Windows
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Open `.env` and fill in at minimum:
```env
PORT=3000
BASE_CURRENCY=IDR
```

Leave platform secrets blank for now — you only need these two to start.

---

### 5 — Start the server

```bash
npm start
```

You should see:
```
  ⏱  Subathon Timer server running
  →  Control UI  : http://localhost:3000
  →  OBS Overlay : http://localhost:3000/overlay
  →  Sociabuzz   : POST /webhook/sociabuzz
```

Open **http://localhost:3000** in your browser. The dot in the nav turns green when connected.

> **Tip:** Use `npm run dev` during development — it auto-restarts on every file save.

---

### 6 — Configure your settings

1. Go to the **Settings** tab
2. Set your starting time (e.g. 2 hours)
3. Set your base currency (IDR)
4. Configure your donation rules (e.g. IDR 10,000 = +2 minutes)
5. Click **Save settings**

This writes `settings.json` to disk. The server reads it immediately — no restart needed. Your rules now survive server restarts and power cuts.

> **Important:** Do this before testing any webhooks. If `settings.json` doesn't
> exist or has no rules, the server falls back to built-in defaults which may not
> match what you want.

---

### 7 — Add the OBS Browser Source

1. Open OBS → your scene → click **+** under Sources → **Browser**
2. Name it `Subathon Timer`
3. Set URL to: `http://localhost:3000/overlay`
4. Width: `500` Height: `160`
5. Check **"Shutdown source when not visible"**
6. Check **"Refresh browser when scene becomes active"**
7. Click **OK**

> **Customize the overlay:** Go to the **Overlay Settings** tab → tweak fonts,
> colors, sizes, glow, background → click **Save overlay** → click **Copy URL**
> → paste that URL into OBS instead of the plain one. All settings are baked
> into the URL so OBS always loads your exact look.

> **Multi-machine note:** The `localhost` URL only works when OBS and the server
> run on the same PC. If they're on different machines on the same network, use
> the server machine's local IP instead: `http://192.168.1.X:3000/overlay`.
> Run `ipconfig` on the server machine to find its IP.

---

##  Cloudflare Tunnel setup

The tunnel gives donation platforms (Sociabuzz, Trakteer) a public HTTPS URL to
send webhooks to. You have two options depending on whether you own a domain.

---

### Option A — No domain (free, random URL)

Best for: occasional use, testing, or if you don't want to buy a domain.

**Limitation:** The URL changes every time you restart `cloudflared`. You'll need
to update the webhook URL in each platform dashboard before every stream (~3 min).

**Step 1 — Install cloudflared**

Download the Windows installer from:
```
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```
Run it with all defaults. Verify:
```
cloudflared --version
```

**Step 2 — Start the tunnel**

```bash
npm run tunnel:quick
```

You'll see a URL like:
```
https://jungle-potato-4829.trycloudflare.com
```

Copy it — this is your public webhook base URL for this session.

**Step 3 — Update webhook URLs in each platform**

| Platform | Webhook URL |
|---|---|
| Sociabuzz | `https://jungle-potato-4829.trycloudflare.com/webhook/sociabuzz?token=YOUR_TOKEN_HERE` |

Repeat this step every stream when the URL changes.

**Step 4 — Start everything together**

Instead of running two terminals, use:
```bash
npm run stream:quick
```
This starts the server and the quick tunnel together.

---

### Option B — With a domain (permanent URL) ✅ Recommended

Best for: regular streamers. Set your webhook URLs once and never touch them again.

Your domain: **https://subathon.YOUR_DOMAIN_HERE**

See **`CLOUDFLARE_SETUP.md`** for the complete Windows + Rumahweb walkthrough.

**Quick summary of one-time steps:**
1. Move your domain's DNS to Cloudflare (change nameservers at Rumahweb)
2. Install `cloudflared` on Windows
3. Run `cloudflared tunnel login`
4. Run `cloudflared tunnel create subathon`
5. Run `cloudflared tunnel route dns subathon subathon.YOUR_DOMAIN_HERE`
6. Fill in your tunnel ID and Windows username in `tunnel/config.yml`

**Every stream, just run:**
```bash
npm run stream
```
This starts the server and tunnel together. Your URL is always
`https://subathon.YOUR_DOMAIN_HERE` — no setup needed before each stream.

**Webhook URLs (permanent — set once):**

| Platform | Webhook URL |
|---|---|
| Sociabuzz | `https://subathon.YOUR_DOMAIN_HERE/webhook/sociabuzz?token=YOUR_TOKEN_HERE` |

---

##  Donation platform setup

### Sociabuzz ✅

1. Sociabuzz dashboard → **Integrasi** → **Webhook**
2. **Webhook URL**: your URL from above + `/webhook/sociabuzz`
3. **Webhook Token**: copy the token → open `.env` → add:
   ```
   SOCIABUZZ_TOKEN=paste_your_token_here
   ```
4. Save `.env` and restart the server (`Ctrl+C` then `npm start` or `npm run stream`)
5. Click **Webhook HTTP Test** in Sociabuzz

In your terminal you should see:
```
[sociabuzz] raw payload: { ... }
[sociabuzz] donation from Jessica — IDR 10.000
[donation]   rule IDR 10000 × 1 = +600s  (rem: 0)
[donation] sociabuzz | Jessica | IDR 10000 | total +600s
```

And the donation log in the UI should show the donor name, amount, and message.

**How the token works:** Every request Sociabuzz sends includes
`Authorization: Bearer YOUR_TOKEN`. Your server checks it matches `.env` —
mismatched requests are rejected with 401. This prevents fake donations.

**What the HTTP Test does:** Fires a real-looking test payload at your webhook.
Safe to click any number of times. Use it to verify the full chain works before
going live.

### Trakteer
*(Phase 6 — coming next)*

### Saweria
*(Phase 6 — coming next)*

---

## 🧮 How donation rules work

Rules are configured in the **Settings** tab and saved to `settings.json`.

The server uses a **tiered calculation** — it walks your rules from highest to
lowest, takes as many full multiples as it can from each tier, then passes the
remainder down to the next rule.

**Example setup:**
```
IDR  5,000 = +1 minute
IDR 10,000 = +2 minutes
IDR 50,000 = +10 minutes
```

**Example donations:**

| Donation | Calculation | Time added |
|---|---|---|
| IDR 10,000 | 10k × 1 = +2min | **+2 minutes** |
| IDR 50,000 | 50k × 1 = +10min | **+10 minutes** |
| IDR 60,000 | 50k × 1 = +10min, 10k × 1 = +2min | **+12 minutes** |
| IDR 35,000 | 10k × 3 = +6min, rem 5k → 5k × 1 = +1min | **+7 minutes** |
| IDR  7,000 | 5k × 1 = +1min, rem 2k (below threshold) | **+1 minute** |
| IDR  4,000 | Below all thresholds | **+0** |

---

## ⚡ Power cut / crash recovery

`state.json` is written every second while the timer runs, and immediately on
every pause, reset, and time-add.

On restart after a power cut:
```
↺  Restored state — 4521s remaining (was RUNNING)
⚡  Power-cut drift: -47s applied
```

The server calculates how long the power was out and subtracts that from the
remaining time. The timer always restores as **PAUSED** — you click Start to
resume when ready.

On a clean shutdown (`Ctrl+C`), the exact state is saved with zero drift.

---

## npm scripts reference

| Command | What it does |
|---|---|
| `npm start` | Start the server only |
| `npm run dev` | Start server with auto-restart on file changes |
| `npm run tunnel` | Start Cloudflare Tunnel using `tunnel/config.yml` (Option B — permanent URL) |
| `npm run tunnel:quick` | Start tunnel with random URL, no config needed (Option A) |
| `npm run stream` | Server + permanent tunnel together (Option B) |
| `npm run stream:quick` | Server + quick tunnel together (Option A) |

---

## Build checklist

### Phase 1 — Timer UI ✅
- [x] Countdown display, start/pause/reset
- [x] Manual time addition
- [x] Donation log with platform badges, donor name, amount, message
- [x] Low-time warning color change
- [x] Settings panel saved to localStorage + server

### Phase 2 — Local server ✅
- [x] Node.js + Express + Socket.IO
- [x] Server-side timer state (survives browser close)
- [x] `state.json` written every second — power-cut safe
- [x] `settings.json` written on Save — rules survive restarts
- [x] Graceful shutdown on Ctrl+C
- [x] REST endpoints: start, pause, reset, add, settings sync

### Phase 3 — Overlay customization ✅
- [x] 30+ Google Fonts + custom font input
- [x] Full color control (digits, glow, label, status, background)
- [x] Size, padding, radius, opacity sliders
- [x] Transparent background toggle
- [x] Live preview + auto-generated OBS URL

### Phase 4 — Cloudflare Tunnel ✅
- [x] `cloudflared` installed on Windows
- [x] Tunnel created: `subathon`
- [x] Domain: `subathon.YOUR_DOMAIN_HERE`
- [x] Option A (quick random URL): `npm run tunnel:quick`
- [x] Option B (permanent URL): `npm run tunnel` / `npm run stream`

### Phase 5 — Sociabuzz ✅
- [x] Webhook handler with Bearer token verification
- [x] Indonesian amount parser (`10.000` → 10000)
- [x] Tiered donation calculation (highest rule first, remainder cascades down)
- [x] Donor name, amount, message shown in donation log
- [x] Rules and settings persist to `settings.json`
- [ ] Verify with real donation (not just HTTP Test)

### Phase 6 — Trakteer + Saweria
- [ ] Trakteer webhook handler + HMAC verification
- [ ] Saweria WebSocket listener
- [ ] Wire both into `processDonation()`

### Phase 7 — Currency conversion
- [ ] ExchangeRate-API integration
- [ ] Hourly rate cache
- [ ] Convert all incoming currencies to base (IDR) before rule matching

## License

MIT
