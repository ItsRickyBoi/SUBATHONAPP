// ── server/index.js ──────────────────────────────────────────────────────────
// Main Express server — serves the UI, manages timer state, bridges Socket.IO
// State is persisted to state.json every second so it survives power cuts.
// -----------------------------------------------------------------------------

const express      = require('express');
const http         = require('http');
const path         = require('path');
const fs           = require('fs');
const { Server }   = require('socket.io');
const sociabuzz    = require('./webhooks/sociabuzz');
const saweria      = require('./webhooks/saweria');
const trakteer     = require('./webhooks/trakteer');
const kofi         = require('./webhooks/kofi');
const currency     = require('./currency');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT            = process.env.PORT || 3000;
const STATE_FILE      = path.join(__dirname, '..', 'state.json');
const DONATIONS_FILE  = path.join(__dirname, '..', 'donations.json');
const MAX_LOG_ENTRIES = 500;   // cap kept in file — oldest entries are trimmed

// ── DONATION LOG PERSISTENCE ──────────────────────────────────────────────────
function loadDonationsFromDisk() {
  try {
    if (fs.existsSync(DONATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(DONATIONS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[donations] could not read donations.json:', e.message);
  }
  return [];
}

function saveDonationToDisk(entry) {
  try {
    const list = loadDonationsFromDisk();
    list.push(entry);
    // Keep only the most recent MAX_LOG_ENTRIES so the file never grows forever
    const trimmed = list.slice(-MAX_LOG_ENTRIES);
    fs.writeFileSync(DONATIONS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.warn('[donations] write failed:', e.message);
  }
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
// Capture the raw body bytes on every request so webhook handlers can verify
// HMAC signatures. express.json() would otherwise discard the raw bytes.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;   // Buffer — used by saweria.js for HMAC
  }
}));

// ── TEST ENDPOINT — simulate a donation (dev only) ────────────────────────────
// POST /api/test/donation
// Body: { name, amount, currency, platform, message }
// Example: { "name": "Test", "amount": 1, "currency": "USD", "platform": "test" }
app.post('/api/test/donation', async (req, res) => {
  const { name = 'Test Donor', amount = 1, currency: cur = 'USD', platform = 'test', message = '' } = req.body;
  console.log(`[test] simulating donation: ${cur} ${amount} from ${name}`);
  await handleDonation({ platform, name, amount: parseFloat(amount), currency: cur.toUpperCase(), message });
  res.json({ ok: true, simulated: { name, amount, currency: cur, platform } });
});
// Must be registered BEFORE the static file middleware so Express doesn't
// swallow POST requests with a 404 before they reach these routes.

// Sociabuzz
app.post('/webhook/sociabuzz', sociabuzz(handleDonation));

// Saweria — HMAC verified using req.rawBody captured by express.json() verify
app.post('/webhook/saweria', saweria(handleDonation));

// Trakteer — X-Webhook-Token header verification
app.post('/webhook/trakteer', trakteer(handleDonation));

// Ko-fi sends application/x-www-form-urlencoded — urlencoded middleware on this route only
app.post('/webhook/kofi',
  express.urlencoded({ extended: true }),
  kofi(handleDonation)
);

// Serve main control UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// Serve OBS overlay
app.use('/overlay', express.static(path.join(__dirname, '..', 'overlay')));

// ── STATE PERSISTENCE ─────────────────────────────────────────────────────────
function loadStateFromDisk() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw   = fs.readFileSync(STATE_FILE, 'utf8');
      const saved = JSON.parse(raw);
      console.log(`  ↺  Restored state — ${saved.totalSeconds}s remaining (was ${saved.running ? 'RUNNING' : 'PAUSED'})`);
      if (saved.running && saved.savedAt) {
        const drift = Math.floor((Date.now() - saved.savedAt) / 1000);
        saved.totalSeconds = Math.max(0, saved.totalSeconds - drift);
        console.log(`  ⚡  Power-cut drift: -${drift}s applied`);
      }
      saved.running = false;
      return saved;
    }
  } catch (e) {
    console.warn('  ⚠  Could not read state.json, starting fresh:', e.message);
  }
  return { totalSeconds: 0, running: false, savedAt: null };
}

function saveStateToDisk() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...timerState, savedAt: Date.now() }), 'utf8');
  } catch (e) {
    console.warn('[state] write failed:', e.message);
  }
}

// ── TIMER STATE ───────────────────────────────────────────────────────────────
const timerState = loadStateFromDisk();
let tickInterval  = null;

function startServerTick() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (!timerState.running || timerState.totalSeconds <= 0) {
      if (timerState.totalSeconds <= 0) {
        timerState.running = false;
        clearInterval(tickInterval);
        tickInterval = null;
        saveStateToDisk();
      }
      return;
    }
    timerState.totalSeconds--;
    timerState.lastTick = Date.now();
    saveStateToDisk();
    io.emit('timer:tick', { totalSeconds: timerState.totalSeconds });
  }, 1000);
}

function stopServerTick() {
  clearInterval(tickInterval);
  tickInterval = null;
}

// ── DONATION PROCESSOR ────────────────────────────────────────────────────────
// handleDonation is the async entry point called by webhook routes.
// It handles currency conversion then calls the sync processDonation core.

async function handleDonation(donation) {
  const { platform, name, message } = donation;
  let { amount, currency: donationCurrency } = donation;

  const settings     = loadSettings();
  const baseCurrency = (settings.currency || process.env.BASE_CURRENCY || 'IDR').toUpperCase();

  let convertedAmount  = amount;
  let conversionFailed = false;

  if (donationCurrency.toUpperCase() !== baseCurrency) {
    try {
      convertedAmount = await currency.convert(amount, donationCurrency, baseCurrency);
      console.log(`[donation] converted ${donationCurrency} ${amount} → ${baseCurrency} ${convertedAmount}`);
    } catch (e) {
      console.warn(`[donation] currency conversion failed: ${e.message} — falling back to raw amount`);
      conversionFailed = true;
    }
  }

  const matchAmount   = conversionFailed ? amount           : convertedAmount;
  const matchCurrency = conversionFailed ? donationCurrency : baseCurrency;

  processDonation({ ...donation, amount: matchAmount, currency: matchCurrency,
    originalAmount: amount, originalCurrency: donationCurrency, convertedAmount });
}

function processDonation(donation) {
  const { platform, name, message,
    amount, currency: cur,
    originalAmount, originalCurrency } = donation;

  const rules = loadRules();

  const normalizedRules = rules
    .map(r => ({
      ...r,
      amount  : Number(r.amount),
      addSecs : Number(r.addSecs),
      currency: String(r.currency || '').toUpperCase().trim(),
    }))
    .filter(r => r.currency === cur && r.amount > 0 && r.addSecs > 0)
    .sort((a, b) => b.amount - a.amount);

  console.log(`[donation] matching against ${normalizedRules.length} rule(s):`,
    normalizedRules.map(r => `${r.currency} ${r.amount} -> +${r.addSecs}s`).join(', ') || '(none)');

  // Find the best matching rule — highest rule whose amount is <= donation.
  // Then apply its rate (secs per unit) proportionally to the full donation.
  // e.g. rule: IDR 50,000 = 600s → rate = 600/50000 = 0.012 s/IDR
  //      donation IDR 60,000 → 60000 × 0.012 = 720s = 12 minutes (floored)
  const matchingRule = normalizedRules.find(r => amount >= r.amount);

  let addedSecs = 0;

  if (!matchingRule) {
    console.log(`[donation] no time added — ${cur} ${amount} is below the minimum rule threshold (lowest: ${normalizedRules.length ? normalizedRules[normalizedRules.length - 1].amount : 'n/a'})`);
  } else {
    const ratePerUnit = matchingRule.addSecs / matchingRule.amount;
    addedSecs = Math.floor(amount * ratePerUnit);
    console.log(`[donation]   rule ${matchingRule.currency} ${matchingRule.amount} → rate ${ratePerUnit.toFixed(6)} s/unit × ${amount} = +${addedSecs}s`);
  }

  const displayCurrency = originalCurrency || cur;
  const displayAmount   = originalAmount   || amount;
  const converted       = originalCurrency && originalCurrency !== cur ? ` (≈ ${cur} ${amount})` : '';
  console.log(`[donation] ${platform} | ${name} | ${displayCurrency} ${displayAmount}${converted} | total +${addedSecs}s`);

  if (addedSecs > 0) {
    timerState.totalSeconds += addedSecs;
    saveStateToDisk();
  }

  const entry = {
    ts             : Date.now(),
    platform,
    donor          : name,
    amount         : displayAmount,
    currency       : displayCurrency,
    convertedAmount: originalCurrency ? amount : undefined,
    baseCurrency   : originalCurrency ? cur    : undefined,
    addedSecs,
    message        : message || '',
  };

  // Persist to donations.json — survives page refresh
  saveDonationToDisk(entry);

  // Broadcast to all connected clients (control UI + OBS overlay)
  io.emit('timer:add', {
    ...entry,
    seconds      : addedSecs,
    totalSeconds : timerState.totalSeconds,
  });
}

function loadSettings() {
  const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (Array.isArray(s.rules) && s.rules.length > 0) {
        console.log(`[settings] loaded from settings.json — ${s.rules.length} rule(s), base currency: ${s.currency || 'IDR'}`);
        return s;
      }
      console.warn('[settings] settings.json has no rules — using built-in defaults');
    } else {
      console.warn('[settings] settings.json not found — using built-in defaults until you click "Save settings" in the UI');
    }
  } catch (e) {
    console.warn('[settings] could not read settings.json:', e.message);
  }
  return {
    currency: 'IDR',
    warnMinutes: 10,
    rules: [
      { amount: 5000,  currency: 'IDR', addSecs: 60  },
      { amount: 10000, currency: 'IDR', addSecs: 120 },
      { amount: 50000, currency: 'IDR', addSecs: 600 },
    ],
  };
}

function loadRules() {
  return loadSettings().rules;
}

// ── REST ENDPOINTS — TIMER ────────────────────────────────────────────────────

app.get('/api/state', (req, res) => res.json(timerState));

// Current exchange rates — UI can show these for reference
app.get('/api/rates', (req, res) => {
  const cache = currency.getCache();
  res.json({
    base     : cache.base,
    fetchedAt: cache.fetchedAt,
    ageMinutes: cache.fetchedAt ? Math.floor((Date.now() - cache.fetchedAt) / 60000) : null,
    rates    : cache.rates,
  });
});

// GET /api/donations         → today's donations only (default)
// GET /api/donations?all=1   → every donation ever saved
app.get('/api/donations', (req, res) => {
  const list = loadDonationsFromDisk();
  if (req.query.all === '1') return res.json(list);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  res.json(list.filter(e => e.ts >= todayStart.getTime()));
});

// DELETE /api/donations       → clear today's entries only, keep older ones
// DELETE /api/donations?all=1 → wipe everything
app.delete('/api/donations', (req, res) => {
  try {
    const f = path.join(__dirname, '..', 'donations.json');
    if (req.query.all === '1') {
      fs.writeFileSync(f, '[]', 'utf8');
      console.log('[donations] all entries cleared');
    } else {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const kept = loadDonationsFromDisk().filter(e => e.ts < todayStart.getTime());
      fs.writeFileSync(f, JSON.stringify(kept, null, 2), 'utf8');
      console.log(`[donations] today cleared — kept ${kept.length} older entries`);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/timer/start', (req, res) => {
  if (timerState.totalSeconds > 0) {
    timerState.running = true;
    saveStateToDisk();
    startServerTick();
    io.emit('timer:start', { totalSeconds: timerState.totalSeconds });
  }
  res.json(timerState);
});

app.post('/api/timer/pause', (req, res) => {
  timerState.running = false;
  stopServerTick();
  saveStateToDisk();
  io.emit('timer:pause', { totalSeconds: timerState.totalSeconds });
  res.json(timerState);
});

app.post('/api/timer/reset', (req, res) => {
  const { hours = 0, mins = 0, secs = 0 } = req.body;
  timerState.running      = false;
  timerState.totalSeconds = hours * 3600 + mins * 60 + secs;
  stopServerTick();
  saveStateToDisk();
  io.emit('timer:reset', { totalSeconds: timerState.totalSeconds });
  res.json(timerState);
});

app.post('/api/timer/add', (req, res) => {
  const { seconds = 0, donor, amount, currency, platform } = req.body;
  timerState.totalSeconds += seconds;
  saveStateToDisk();
  io.emit('timer:add', { seconds, totalSeconds: timerState.totalSeconds, donor, amount, currency, platform });
  res.json(timerState);
});

// ── REST ENDPOINTS — SETTINGS SYNC ───────────────────────────────────────────
// The browser UI saves settings to localStorage, but the server needs the rules
// for donation processing. This endpoint lets the UI push rules to the server.

app.post('/api/settings', (req, res) => {
  try {
    const f = path.join(__dirname, '..', 'settings.json');
    fs.writeFileSync(f, JSON.stringify(req.body, null, 2), 'utf8');
    const ruleSummary = (req.body.rules || [])
      .map(r => `${r.currency} ${r.amount} -> +${r.addSecs}s`)
      .join(', ') || '(none)';
    console.log(`[settings] updated from UI — rules: ${ruleSummary}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] client connected — ${socket.id}`);
  socket.emit('timer:sync', timerState);
  socket.on('disconnect', () => console.log(`[socket] disconnected — ${socket.id}`));
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n  [${signal}] Saving state and shutting down…`);
  timerState.running = false;
  stopServerTick();
  saveStateToDisk();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`    Run this in Command Prompt to fix it:`);
    console.error(`    netstat -ano | findstr :${PORT}`);
    console.error(`    Then: taskkill /PID <number> /F\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ⏱  Donathon Timer server running');
  console.log(`  →  Control UI  : http://localhost:${PORT}`);
  console.log(`  →  OBS Overlay : http://localhost:${PORT}/overlay`);
  console.log(`  →  Sociabuzz   : POST /webhook/sociabuzz`);
  console.log(`  →  Saweria     : POST /webhook/saweria`);
  console.log(`  →  Trakteer    : POST /webhook/trakteer`);
  console.log(`  →  Ko-fi       : POST /webhook/kofi`);
  console.log(`  →  State file  : ${STATE_FILE}`);
  console.log('');

  // Pre-warm exchange rate cache — runs after server is up
  const baseCurrency = (loadSettings().currency || process.env.BASE_CURRENCY || 'IDR').toUpperCase();
  if (process.env.EXCHANGERATE_API_KEY) {
    currency.prewarm(baseCurrency);
  } else {
    console.warn('  ⚠  EXCHANGERATE_API_KEY not set — foreign currency donations will not be converted');
  }
});
