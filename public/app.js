// ── STATE ────────────────────────────────────────────────────────────────────
// totalSeconds and running are now authoritative on the SERVER.
// The UI mirrors whatever the server says via Socket.IO.
let totalSeconds = 0;
let running      = false;
let settings     = {};
let donations    = [];

const CURRENCIES = ['IDR', 'USD', 'MYR'];

// ── UTILS ─────────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function toSeconds(h, m, s) { return h * 3600 + m * 60 + s; }
function fromSeconds(s) {
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec];
}
function formatTime(s) {
  const [h, m, sec] = fromSeconds(s);
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// ── VIEWS ─────────────────────────────────────────────────────────────────────
function switchView(id, tabEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  tabEl.classList.add('active');
}

// ── DISPLAY ───────────────────────────────────────────────────────────────────
function updateDisplay() {
  const el     = document.getElementById('timerDigits');
  const disp   = document.getElementById('timerDisplay');
  const status = document.getElementById('timerStatus');
  const warn   = (settings.warnMinutes || 10) * 60;

  el.textContent = formatTime(totalSeconds);
  disp.classList.remove('running', 'paused');
  el.classList.remove('running', 'paused', 'low');

  if (running) {
    disp.classList.add('running');
    el.classList.add(totalSeconds <= warn ? 'low' : 'running');
    status.textContent = totalSeconds <= warn ? 'LOW TIME' : 'RUNNING';
  } else if (totalSeconds > 0) {
    disp.classList.add('paused');
    el.classList.add('paused');
    status.textContent = 'PAUSED';
  } else {
    status.textContent = 'STOPPED';
  }
}

// ── TIMER CONTROLS — hit server REST endpoints ────────────────────────────────
async function startTimer() {
  await fetch('/api/timer/start', { method: 'POST' });
}

async function pauseTimer() {
  await fetch('/api/timer/pause', { method: 'POST' });
}

async function resetTimer() {
  const h = parseInt(document.getElementById('setHours').value) || 0;
  const m = parseInt(document.getElementById('setMins').value)  || 0;
  const s = parseInt(document.getElementById('setSecs').value)  || 0;
  await fetch('/api/timer/reset', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ hours: h, mins: m, secs: s })
  });
}

async function addManualTime() {
  const h       = parseInt(document.getElementById('manHours').value) || 0;
  const m       = parseInt(document.getElementById('manMins').value)  || 0;
  const s       = parseInt(document.getElementById('manSecs').value)  || 0;
  const seconds = toSeconds(h, m, s);
  if (seconds <= 0) return;
  await fetch('/api/timer/add', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ seconds })
  });
}

// ── DONATION LOG ──────────────────────────────────────────────────────────────
function logDonation(name, amount, currency, platform, addedSecs, message, ts) {
  document.getElementById('logEmpty').style.display = 'none';

  const log  = document.getElementById('donationLog');
  const item = document.createElement('div');
  item.className = 'log-item';

  const cls = platform === 'saweria'  ? 'saweria'
            : platform === 'trakteer' ? 'trakteer'
            : '';

  const [h, m, s] = fromSeconds(addedSecs || 0);
  const timeStr   = addedSecs > 0
    ? (h > 0 ? `+${h}h ${m}m` : m > 0 ? `+${m}m ${s}s` : `+${s}s`)
    : '—';

  const msgHtml = message
    ? `<span class="log-message">"${message}"</span>`
    : '';

  // Show the real donation timestamp if provided (from history), otherwise now
  const timeLabel = ts
    ? new Date(ts).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  item.innerHTML = `
    <div class="log-item-main">
      <span class="log-platform ${cls}">${platform.toUpperCase()}</span>
      <span class="log-name">${name}</span>
      <span class="log-amount">${currency} ${Number(amount).toLocaleString()}</span>
      <span class="log-added">${timeStr}</span>
      <span class="log-time">${timeLabel}</span>
    </div>
    ${msgHtml}
  `;

  log.insertBefore(item, log.firstChild);
  donations.unshift({ name, amount, currency, platform, addedSecs, message, time: timeLabel });
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function defaultSettings() {
  return {
    hours: 2, mins: 0, secs: 0,
    warnMinutes: 10,
    currency: 'IDR',
    apiKey: '',
    rules: [
      { amount: 5000,  currency: 'IDR', addSecs: 60  },
      { amount: 10000, currency: 'IDR', addSecs: 120 },
    ]
  };
}

function loadSettings() {
  const raw = localStorage.getItem('subathon_settings');
  settings  = raw ? JSON.parse(raw) : defaultSettings();

  document.getElementById('setHours').value    = settings.hours;
  document.getElementById('setMins').value     = settings.mins;
  document.getElementById('setSecs').value     = settings.secs;
  document.getElementById('setWarn').value     = settings.warnMinutes;
  document.getElementById('setCurrency').value = settings.currency;
  document.getElementById('setApiKey').value   = settings.apiKey || '';

  renderRules();
  updateDisplay();
}

function saveSettings() {
  settings = {
    hours:       parseInt(document.getElementById('setHours').value)    || 0,
    mins:        parseInt(document.getElementById('setMins').value)     || 0,
    secs:        parseInt(document.getElementById('setSecs').value)     || 0,
    warnMinutes: parseInt(document.getElementById('setWarn').value)     || 10,
    currency:    document.getElementById('setCurrency').value,
    apiKey:      document.getElementById('setApiKey').value.trim(),
    rules:       readRules()
  };
  localStorage.setItem('subathon_settings', JSON.stringify(settings));

  // Push rules to server so donation processing uses the latest values
  fetch('/api/settings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(settings),
  }).catch(err => console.warn('[settings] failed to sync to server:', err));

  const msg = document.getElementById('saveMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2500);
}

// ── RULES ─────────────────────────────────────────────────────────────────────
function renderRules() {
  const list = document.getElementById('rulesList');
  list.innerHTML = '';
  (settings.rules || []).forEach((r, i) => {
    const [h, m, s] = fromSeconds(r.addSecs);
    const row       = document.createElement('div');
    row.className     = 'rule-row';
    row.dataset.index = i;
    row.innerHTML = `
      <span class="rule-text">Donation of</span>
      <input type="number" class="rule-amount" value="${r.amount}" min="1" style="width:90px"/>
      <select class="rule-cur">
        ${CURRENCIES.map(c => `<option value="${c}" ${c === r.currency ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <span class="rule-text">adds</span>
      <input type="number" class="rule-h" value="${h}" min="0" style="width:52px" placeholder="h"/>
      <span class="rule-text">h</span>
      <input type="number" class="rule-m" value="${m}" min="0" max="59" style="width:52px" placeholder="m"/>
      <span class="rule-text">m</span>
      <input type="number" class="rule-s" value="${s}" min="0" max="59" style="width:52px" placeholder="s"/>
      <span class="rule-text">s</span>
      <button class="del-btn" onclick="deleteRule(${i})" title="Remove">✕</button>
    `;
    list.appendChild(row);
  });
}

function readRules() {
  return Array.from(document.querySelectorAll('.rule-row')).map(row => ({
    amount:   parseFloat(row.querySelector('.rule-amount').value) || 0,
    currency: row.querySelector('.rule-cur').value,
    addSecs:  toSeconds(
      parseInt(row.querySelector('.rule-h').value) || 0,
      parseInt(row.querySelector('.rule-m').value) || 0,
      parseInt(row.querySelector('.rule-s').value) || 0
    )
  }));
}

function addRule() {
  settings.rules = readRules();
  settings.rules.push({ amount: 10000, currency: settings.currency || 'IDR', addSecs: 60 });
  renderRules();
}

function deleteRule(i) {
  settings.rules = readRules();
  settings.rules.splice(i, 1);
  renderRules();
}

// ── SOCKET.IO — receive live updates from server ──────────────────────────────
const socket = io();

socket.on('connect', () => {
  console.log('[ui] connected to server');
  setConnectionStatus(true);
});

socket.on('disconnect', () => {
  console.log('[ui] disconnected');
  setConnectionStatus(false);
});

socket.on('timer:sync',  (d) => {
  totalSeconds = d.totalSeconds;
  running      = d.running;
  updateDisplay();
});
socket.on('timer:tick',  (d) => { totalSeconds = d.totalSeconds; updateDisplay(); });
socket.on('timer:start', (d) => { running = true;  totalSeconds = d.totalSeconds; updateDisplay(); });
socket.on('timer:pause', (d) => { running = false; totalSeconds = d.totalSeconds; updateDisplay(); });
socket.on('timer:reset', (d) => { running = false; totalSeconds = d.totalSeconds; updateDisplay(); });
socket.on('timer:add',   (d) => {
  totalSeconds = d.totalSeconds;
  updateDisplay();
  if (d.donor) logDonation(d.donor, d.amount, d.currency, d.platform, d.addedSecs ?? d.seconds, d.message, d.ts);
});

function setConnectionStatus(connected) {
  const dot = document.getElementById('connDot');
  if (!dot) return;
  dot.style.background = connected ? 'var(--green)' : 'var(--red)';
  dot.title = connected ? 'Connected to server' : 'Disconnected — is the server running?';
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadSettings();

// ── DONATION LOG CONTROLS ─────────────────────────────────────────────────────
function renderDonationList(list) {
  const log      = document.getElementById('donationLog');
  const logEmpty = document.getElementById('logEmpty');
  Array.from(log.querySelectorAll('.log-item')).forEach(el => el.remove());
  if (list.length === 0) {
    if (logEmpty) logEmpty.style.display = '';
    return;
  }
  if (logEmpty) logEmpty.style.display = 'none';
  // list comes oldest-first from server; render newest-first
  [...list].reverse().forEach(e =>
    logDonation(e.donor, e.amount, e.currency, e.platform, e.addedSecs, e.message, e.ts));
}

let currentLogView = 'today'; // tracks whether the log is showing 'today' or 'all'

function loadTodayDonations() {
  currentLogView = 'today';
  fetch('/api/donations')
    .then(r => r.json())
    .then(list => renderDonationList(list))
    .catch(err => console.warn('[donations] could not load history:', err));
}

function loadAllDonations() {
  currentLogView = 'all';
  fetch('/api/donations?all=1')
    .then(r => r.json())
    .then(list => renderDonationList(list))
    .catch(err => console.warn('[donations] could not load history:', err));
}

function clearTodayDonations() {
  if (!confirm("Clear today's donation log? Older donations are kept.")) return;
  fetch('/api/donations', { method: 'DELETE' })
    .then(() => loadTodayDonations())
    .catch(err => console.warn('[donations] clear failed:', err));
}

function clearAllDonations() {
  // This permanently deletes every donation ever recorded, not just today's —
  // require typing a confirmation word so it can't be triggered by a stray click.
  const typed = prompt(
    'This permanently deletes your ENTIRE donation history — not just today, ' +
    'every day you have ever recorded. This cannot be undone.\n\n' +
    'Type DELETE to confirm:'
  );
  if (typed !== 'DELETE') return;

  fetch('/api/donations?all=1', { method: 'DELETE' })
    .then(() => {
      // Refresh whichever view (today / all) was active so the log visibly
      // empties out instead of looking like nothing happened.
      currentLogView === 'all' ? loadAllDonations() : loadTodayDonations();
    })
    .catch(err => console.warn('[donations] clear-all failed:', err));
}

// Load today's donations on page load; inject log control buttons
// app.js runs after the DOM is ready (script tag at bottom of body) so call directly
(function init() {
  loadTodayDonations();

  const titleEl = document.querySelector('#view-timer .section-title');
  if (titleEl) {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    bar.innerHTML = `
      <button class="btn" style="font-size:11px;padding:4px 10px;" onclick="loadTodayDonations()">Today</button>
      <button class="btn" style="font-size:11px;padding:4px 10px;" onclick="loadAllDonations()">Show all</button>
      <button class="btn danger" style="font-size:11px;padding:4px 10px;margin-left:auto;" onclick="clearTodayDonations()">Clear today</button>
      <button class="btn danger" style="font-size:11px;padding:4px 10px;" onclick="clearAllDonations()">Clear all history</button>
    `;
    titleEl.after(bar);
  }
})();


// ── OVERLAY SETTINGS ──────────────────────────────────────────────────────────

const GOOGLE_FONTS_MAP = {
  // Monospace / Tech
  'Share Tech Mono'     : 'Share+Tech+Mono',
  'Orbitron'            : 'Orbitron',
  'Russo One'           : 'Russo+One',
  'VT323'               : 'VT323',
  'Silkscreen'          : 'Silkscreen',
  'Courier Prime'       : 'Courier+Prime',
  'Space Mono'          : 'Space+Mono',
  'Roboto Mono'         : 'Roboto+Mono:wght@600',
  'Source Code Pro'     : 'Source+Code+Pro:wght@600',
  'IBM Plex Mono'       : 'IBM+Plex+Mono:wght@600',
  // Display / Bold
  'Bebas Neue'          : 'Bebas+Neue',
  'Rajdhani'            : 'Rajdhani:wght@600',
  'Oswald'              : 'Oswald',
  'Anton'               : 'Anton',
  'Teko'                : 'Teko:wght@600',
  'Saira Condensed'     : 'Saira+Condensed:wght@700',
  'Exo 2'               : 'Exo+2:wght@700',
  'Michroma'            : 'Michroma',
  'Black Ops One'       : 'Black+Ops+One',
  'Audiowide'           : 'Audiowide',
  'Chakra Petch'        : 'Chakra+Petch:wght@700',
  'Syncopate'           : 'Syncopate:wght@700',
  'Major Mono Display'  : 'Major+Mono+Display',
  // Clean Sans
  'Inter'               : 'Inter:wght@600',
  'Nunito'              : 'Nunito:wght@700',
  'Poppins'             : 'Poppins:wght@600',
  'Montserrat'          : 'Montserrat:wght@700',
  'Barlow'              : 'Barlow:wght@700',
  'DM Sans'             : 'DM+Sans:wght@700',
  'Sora'                : 'Sora:wght@700',
  'Outfit'              : 'Outfit:wght@700',
  // System
  'monospace'           : null,  // system font, no Google Fonts needed
};

function defaultOverlaySettings() {
  return {
    font          : 'Share Tech Mono',
    digitSize     : 72,
    digitColor    : '#ffffff',
    lowColor      : '#e05252',
    pauseColor    : '#f7b731',
    glowColor     : '#7c6ff7',
    glowIntensity : 60,
    labelText     : 'time remaining',
    labelSize     : 11,
    labelColor    : '#888888',
    statusSize    : 11,
    statusColor   : '#666666',
    showLabel     : true,
    showStatus    : true,
    bgColor       : '#000000',
    bgOpacity     : 55,
    borderRadius  : 14,
    padding       : 14,
    transparent   : false,
  };
}

function loadOverlaySettings() {
  const raw = localStorage.getItem('subathon_overlay');
  const ov  = raw ? JSON.parse(raw) : defaultOverlaySettings();

  // Restore font — if saved font isn't in the select list, put it in the custom input
  const fontSel = document.getElementById('ovFont');
  const isKnown = Array.from(fontSel.options).some(o => o.value === ov.font && o.value !== '__custom__');
  if (isKnown) {
    fontSel.value = ov.font;
    document.getElementById('ovFontCustom').style.display = 'none';
    document.getElementById('ovFontHint').style.display   = 'none';
  } else {
    fontSel.value = '__custom__';
    document.getElementById('ovFontCustom').style.display = '';
    document.getElementById('ovFontCustom').value         = ov.font;
    document.getElementById('ovFontHint').style.display   = '';
  }
  document.getElementById('ovDigitSize').value     = ov.digitSize;
  document.getElementById('ovDigitColor').value    = ov.digitColor;
  document.getElementById('ovDigitColorHex').value = ov.digitColor;
  document.getElementById('ovLowColor').value      = ov.lowColor;
  document.getElementById('ovLowColorHex').value   = ov.lowColor;
  document.getElementById('ovPauseColor').value    = ov.pauseColor;
  document.getElementById('ovPauseColorHex').value = ov.pauseColor;
  document.getElementById('ovGlowColor').value     = ov.glowColor;
  document.getElementById('ovGlowColorHex').value  = ov.glowColor;
  document.getElementById('ovGlow').value          = ov.glowIntensity;
  document.getElementById('ovLabelText').value     = ov.labelText;
  document.getElementById('ovLabelSize').value     = ov.labelSize;
  document.getElementById('ovLabelColor').value    = ov.labelColor;
  document.getElementById('ovLabelColorHex').value = ov.labelColor;
  document.getElementById('ovStatusSize').value    = ov.statusSize;
  document.getElementById('ovStatusColor').value   = ov.statusColor;
  document.getElementById('ovStatusColorHex').value= ov.statusColor;
  document.getElementById('ovShowLabel').checked   = ov.showLabel;
  document.getElementById('ovShowStatus').checked  = ov.showStatus;
  document.getElementById('ovBgColor').value       = ov.bgColor;
  document.getElementById('ovBgColorHex').value    = ov.bgColor;
  document.getElementById('ovBgOpacity').value     = ov.bgOpacity;
  document.getElementById('ovRadius').value        = ov.borderRadius;
  document.getElementById('ovPadding').value       = ov.padding;
  document.getElementById('ovTransparent').checked = ov.transparent;

  updateSliderLabels();
  livePreview();
}

function readOverlaySettings() {
  return {
    font          : (document.getElementById('ovFont').value === '__custom__')
                      ? (document.getElementById('ovFontCustom').value.trim() || 'monospace')
                      : document.getElementById('ovFont').value,
    digitSize     : parseInt(document.getElementById('ovDigitSize').value),
    digitColor    : document.getElementById('ovDigitColor').value,
    lowColor      : document.getElementById('ovLowColor').value,
    pauseColor    : document.getElementById('ovPauseColor').value,
    glowColor     : document.getElementById('ovGlowColor').value,
    glowIntensity : parseInt(document.getElementById('ovGlow').value),
    labelText     : document.getElementById('ovLabelText').value,
    labelSize     : parseInt(document.getElementById('ovLabelSize').value),
    labelColor    : document.getElementById('ovLabelColor').value,
    statusSize    : parseInt(document.getElementById('ovStatusSize').value),
    statusColor   : document.getElementById('ovStatusColor').value,
    showLabel     : document.getElementById('ovShowLabel').checked,
    showStatus    : document.getElementById('ovShowStatus').checked,
    bgColor       : document.getElementById('ovBgColor').value,
    bgOpacity     : parseInt(document.getElementById('ovBgOpacity').value),
    borderRadius  : parseInt(document.getElementById('ovRadius').value),
    padding       : parseInt(document.getElementById('ovPadding').value),
    transparent   : document.getElementById('ovTransparent').checked,
  };
}

function saveOverlaySettings() {
  const ov = readOverlaySettings();
  localStorage.setItem('subathon_overlay', JSON.stringify(ov));
  updateOverlayUrl(ov);

  const msg = document.getElementById('overlaySaveMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2500);
}

function resetOverlaySettings() {
  localStorage.removeItem('subathon_overlay');
  loadOverlaySettings();
}

// ── LIVE PREVIEW ──────────────────────────────────────────────────────────────
function livePreview() {
  updateSliderLabels();

  const ov = readOverlaySettings();

  // Background
  const wrap = document.getElementById('previewWrap');
  if (ov.transparent) {
    wrap.style.background = 'transparent';
    wrap.style.border     = 'none';
  } else {
    const r   = parseInt(ov.bgColor.slice(1,3), 16);
    const g   = parseInt(ov.bgColor.slice(3,5), 16);
    const b   = parseInt(ov.bgColor.slice(5,7), 16);
    const a   = (ov.bgOpacity / 100).toFixed(2);
    wrap.style.background    = `rgba(${r},${g},${b},${a})`;
    wrap.style.border        = '1px solid rgba(255,255,255,0.08)';
  }
  wrap.style.borderRadius = `${ov.borderRadius}px`;
  wrap.style.padding      = `${ov.padding}px ${ov.padding * 2}px`;

  // Digits
  const glowR = parseInt(ov.glowColor.slice(1,3), 16);
  const glowG = parseInt(ov.glowColor.slice(3,5), 16);
  const glowB = parseInt(ov.glowColor.slice(5,7), 16);
  const glowA = (ov.glowIntensity / 100).toFixed(2);

  const digits = document.getElementById('previewDigits');
  digits.style.fontFamily  = `'${ov.font}', monospace`;
  digits.style.fontSize    = `${ov.digitSize}px`;
  digits.style.color       = ov.digitColor;
  digits.style.textShadow  = `0 0 24px rgba(${glowR},${glowG},${glowB},${glowA})`;

  // Label
  const label = document.getElementById('previewLabel');
  label.style.display    = ov.showLabel ? 'block' : 'none';
  label.style.fontFamily = `'${ov.font}', monospace`;
  label.style.fontSize   = `${ov.labelSize}px`;
  label.style.color      = ov.labelColor;
  label.textContent      = ov.labelText;

  // Status
  const status = document.getElementById('previewStatus');
  status.style.display    = ov.showStatus ? 'block' : 'none';
  status.style.fontFamily = `'${ov.font}', monospace`;
  status.style.fontSize   = `${ov.statusSize}px`;
  status.style.color      = ov.statusColor;

  // Load Google Font into preview if needed
  loadPreviewFont(ov.font);

  updateOverlayUrl(ov);
}

function updateSliderLabels() {
  const sliders = [
    ['ovDigitSize',  'ovDigitSizeVal'],
    ['ovGlow',       'ovGlowVal'],
    ['ovLabelSize',  'ovLabelSizeVal'],
    ['ovStatusSize', 'ovStatusSizeVal'],
    ['ovBgOpacity',  'ovBgOpacityVal'],
    ['ovRadius',     'ovRadiusVal'],
    ['ovPadding',    'ovPaddingVal'],
  ];
  sliders.forEach(([sliderId, labelId]) => {
    const el = document.getElementById(sliderId);
    const lbl = document.getElementById(labelId);
    if (el && lbl) lbl.textContent = el.value;
  });
}

// Sync color picker ↔ hex text input
function syncColorFromHex(pickerId, hexId) {
  const hexEl  = document.getElementById(hexId);
  const picker = document.getElementById(pickerId);
  const val    = hexEl.value;
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    picker.value = val;
    if (pickerId.startsWith('dl')) {
      dlLivePreview();
    } else {
      livePreview();
    }
  }
}

// When color picker changes, update the hex text box too
document.addEventListener('input', (e) => {
  const pairs = {
    ovDigitColor  : 'ovDigitColorHex',
    ovLowColor    : 'ovLowColorHex',
    ovPauseColor  : 'ovPauseColorHex',
    ovGlowColor   : 'ovGlowColorHex',
    ovLabelColor  : 'ovLabelColorHex',
    ovStatusColor : 'ovStatusColorHex',
    ovBgColor     : 'ovBgColorHex',
  };
  if (pairs[e.target.id]) {
    document.getElementById(pairs[e.target.id]).value = e.target.value;
  }
});

// ── GOOGLE FONTS LOADER ───────────────────────────────────────────────────────
const loadedFonts = new Set();
function loadPreviewFont(font) {
  if (!font || font === 'monospace' || font === '__custom__') return;
  if (loadedFonts.has(font)) return;
  loadedFonts.add(font);
  const link = document.createElement('link');
  link.rel  = 'stylesheet';
  // Use known map entry if available, otherwise auto-encode the name for Google Fonts
  const key = GOOGLE_FONTS_MAP[font];
  const encoded = (key !== undefined) ? key : font.trim().replace(/ /g, '+') + ':wght@400;700';
  if (encoded === null) return; // system font
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  document.head.appendChild(link);
}

// ── FONT SELECT / CUSTOM INPUT HANDLERS ──────────────────────────────────────
function onFontSelectChange() {
  const sel    = document.getElementById('ovFont');
  const input  = document.getElementById('ovFontCustom');
  const hint   = document.getElementById('ovFontHint');
  const custom = sel.value === '__custom__';
  input.style.display = custom ? '' : 'none';
  hint.style.display  = custom ? '' : 'none';
  if (!custom) livePreview();
}

let _fontDebounce = null;
function onFontCustomInput() {
  clearTimeout(_fontDebounce);
  _fontDebounce = setTimeout(() => {
    const val = document.getElementById('ovFontCustom').value.trim();
    if (val) { loadPreviewFont(val); livePreview(); }
  }, 500);
}

// ── BUILD OVERLAY URL ─────────────────────────────────────────────────────────
function buildOverlayUrl(ov) {
  const base   = 'http://localhost:3000/overlay';
  const params = new URLSearchParams();

  params.set('font',        ov.font);
  params.set('digitSize',   ov.digitSize);
  params.set('digitColor',  ov.digitColor.replace('#',''));
  params.set('lowColor',    ov.lowColor.replace('#',''));
  params.set('pauseColor',  ov.pauseColor.replace('#',''));
  params.set('glowColor',   ov.glowColor.replace('#',''));
  params.set('glowOpacity', (ov.glowIntensity / 100).toFixed(2));
  params.set('labelText',   ov.labelText);
  params.set('labelSize',   ov.labelSize);
  params.set('labelColor',  ov.labelColor.replace('#',''));
  params.set('statusSize',  ov.statusSize);
  params.set('statusColor', ov.statusColor.replace('#',''));
  params.set('label',       ov.showLabel  ? '1' : '0');
  params.set('status',      ov.showStatus ? '1' : '0');
  params.set('bgColor',     ov.bgColor.replace('#',''));
  params.set('bgOpacity',   (ov.bgOpacity / 100).toFixed(2));
  params.set('radius',      ov.borderRadius);
  params.set('padding',     ov.padding);
  params.set('transparent', ov.transparent ? '1' : '0');

  return `${base}?${params.toString()}`;
}

function updateOverlayUrl(ov) {
  const url = buildOverlayUrl(ov);
  document.getElementById('overlayUrl').textContent = url;
}

function copyOverlayUrl() {
  const url = document.getElementById('overlayUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const msg = document.getElementById('urlCopyMsg');
    msg.style.opacity = '1';
    setTimeout(() => msg.style.opacity = '0', 2000);
  });
}

// ── INIT: load overlay settings on page load ──────────────────────────────────
loadOverlaySettings();

// ── DONATION LOG APPEARANCE ───────────────────────────────────────────────────
function defaultDonationLogSettings() {
  return {
    nameSize:      13,
    nameColor:     '#e8eaf0',
    amountSize:    12,
    amountColor:   '#7a8094',
    addedSize:     12,
    addedColor:    '#3ecf8e',
    platformSize:  10,
    messageSize:   11,
    messageColor:  '#444c61',
    rowPad:        12,
    maxHeight:     260,
    showMessage:   true,
    showTime:      true,
  };
}

function loadDonationLogSettings() {
  const raw = localStorage.getItem('subathon_donationlog');
  const dl  = raw ? JSON.parse(raw) : defaultDonationLogSettings();

  document.getElementById('dlNameSize').value        = dl.nameSize;
  document.getElementById('dlNameColor').value        = dl.nameColor;
  document.getElementById('dlNameColorHex').value     = dl.nameColor;
  document.getElementById('dlAmountSize').value       = dl.amountSize;
  document.getElementById('dlAmountColor').value      = dl.amountColor;
  document.getElementById('dlAmountColorHex').value   = dl.amountColor;
  document.getElementById('dlAddedSize').value        = dl.addedSize;
  document.getElementById('dlAddedColor').value       = dl.addedColor;
  document.getElementById('dlAddedColorHex').value    = dl.addedColor;
  document.getElementById('dlPlatformSize').value     = dl.platformSize;
  document.getElementById('dlMessageSize').value      = dl.messageSize;
  document.getElementById('dlMessageColor').value     = dl.messageColor;
  document.getElementById('dlMessageColorHex').value  = dl.messageColor;
  document.getElementById('dlRowPad').value           = dl.rowPad;
  document.getElementById('dlMaxHeight').value        = dl.maxHeight;
  document.getElementById('dlShowMessage').checked    = dl.showMessage;
  document.getElementById('dlShowTime').checked       = dl.showTime;

  applyDonationLogSettings(dl);
  updateDlSliderLabels();
}

function readDonationLogSettings() {
  return {
    nameSize:     parseInt(document.getElementById('dlNameSize').value),
    nameColor:    document.getElementById('dlNameColor').value,
    amountSize:   parseInt(document.getElementById('dlAmountSize').value),
    amountColor:  document.getElementById('dlAmountColor').value,
    addedSize:    parseInt(document.getElementById('dlAddedSize').value),
    addedColor:   document.getElementById('dlAddedColor').value,
    platformSize: parseInt(document.getElementById('dlPlatformSize').value),
    messageSize:  parseInt(document.getElementById('dlMessageSize').value),
    messageColor: document.getElementById('dlMessageColor').value,
    rowPad:       parseInt(document.getElementById('dlRowPad').value),
    maxHeight:    parseInt(document.getElementById('dlMaxHeight').value),
    showMessage:  document.getElementById('dlShowMessage').checked,
    showTime:     document.getElementById('dlShowTime').checked,
  };
}

// Applies the given settings as CSS variables on an element (defaults to the
// real donation log on the Timer tab). The preview box on the Settings tab
// gets the same variables applied separately so it always matches live.
function applyDonationLogSettings(dl, el) {
  const target = el || document.getElementById('donationLog');
  if (!target) return;
  target.style.setProperty('--dl-name-size',      dl.nameSize + 'px');
  target.style.setProperty('--dl-name-color',      dl.nameColor);
  target.style.setProperty('--dl-amount-size',     dl.amountSize + 'px');
  target.style.setProperty('--dl-amount-color',    dl.amountColor);
  target.style.setProperty('--dl-added-size',      dl.addedSize + 'px');
  target.style.setProperty('--dl-added-color',     dl.addedColor);
  target.style.setProperty('--dl-platform-size',   dl.platformSize + 'px');
  target.style.setProperty('--dl-message-size',    dl.messageSize + 'px');
  target.style.setProperty('--dl-message-color',   dl.messageColor);
  target.style.setProperty('--dl-row-padding-v',   dl.rowPad + 'px');
  target.style.setProperty('--dl-max-height',      dl.maxHeight + 'px');
  target.style.setProperty('--dl-show-message',    dl.showMessage ? 'block' : 'none');
  target.style.setProperty('--dl-show-time',       dl.showTime ? 'inline' : 'none');
}

function dlLivePreview() {
  updateDlSliderLabels();
  const dl = readDonationLogSettings();
  applyDonationLogSettings(dl, document.getElementById('dlPreviewLog'));
  applyDonationLogSettings(dl); // keep the real log in sync too, live
}

function updateDlSliderLabels() {
  const sliders = [
    ['dlNameSize',     'dlNameSizeVal'],
    ['dlAmountSize',   'dlAmountSizeVal'],
    ['dlAddedSize',    'dlAddedSizeVal'],
    ['dlPlatformSize', 'dlPlatformSizeVal'],
    ['dlMessageSize',  'dlMessageSizeVal'],
    ['dlRowPad',       'dlRowPadVal'],
    ['dlMaxHeight',    'dlMaxHeightVal'],
  ];
  sliders.forEach(([sliderId, labelId]) => {
    const el  = document.getElementById(sliderId);
    const lbl = document.getElementById(labelId);
    if (el && lbl) lbl.textContent = el.value;
  });
}

function saveDonationLogSettings() {
  const dl = readDonationLogSettings();
  localStorage.setItem('subathon_donationlog', JSON.stringify(dl));
  applyDonationLogSettings(dl);

  const msg = document.getElementById('dlSaveMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 2500);
}

function resetDonationLogSettings() {
  localStorage.removeItem('subathon_donationlog');
  loadDonationLogSettings();
}

// Hook the shared color-picker <-> hex-input sync (already wired for overlay
// colors) to also cover the donation log color pickers.
document.addEventListener('input', (e) => {
  const dlPairs = {
    dlNameColor:    'dlNameColorHex',
    dlAmountColor:  'dlAmountColorHex',
    dlAddedColor:   'dlAddedColorHex',
    dlMessageColor: 'dlMessageColorHex',
  };
  if (dlPairs[e.target.id]) {
    document.getElementById(dlPairs[e.target.id]).value = e.target.value;
  }
});

loadDonationLogSettings();
