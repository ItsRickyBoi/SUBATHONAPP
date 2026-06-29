// ── server/currency.js ────────────────────────────────────────────────────────
// Exchange rate cache + conversion helper.
// Uses ExchangeRate-API (https://www.exchangerate-api.com) — free tier gives
// 1,500 requests/month, which is more than enough with hourly caching.
//
// Exports:
//   convert(amount, from, to)  → Promise<number>  (rejects if API unavailable)
//   getCache()                 → { base, rates, fetchedAt }
//   prewarm(baseCurrency)      → void  (fetches rates in the background)
// -----------------------------------------------------------------------------

const https = require('https');

// ── In-memory rate cache ───────────────────────────────────────────────────────
const cache = {
  base     : null,   // e.g. 'IDR'
  rates    : {},     // e.g. { USD: 0.000062, MYR: 0.00029, ... }
  fetchedAt: null,   // Date.now() timestamp of last successful fetch
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Fetch rates from ExchangeRate-API ─────────────────────────────────────────
function fetchRates(baseCurrency) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    if (!apiKey) {
      return reject(new Error('EXCHANGERATE_API_KEY not set in .env'));
    }

    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency.toUpperCase()}`;

    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.result !== 'success') {
            return reject(new Error(`ExchangeRate-API error: ${json['error-type'] || 'unknown'}`));
          }
          cache.base      = json.base_code;
          cache.rates     = json.conversion_rates;
          cache.fetchedAt = Date.now();
          console.log(`[currency] rates fetched — base: ${cache.base}, ${Object.keys(cache.rates).length} currencies`);
          resolve(cache);
        } catch (e) {
          reject(new Error(`Failed to parse rate response: ${e.message}`));
        }
      });
    }).on('error', (e) => reject(new Error(`Rate fetch network error: ${e.message}`)));
  });
}

// ── Ensure cache is fresh, fetching if needed ─────────────────────────────────
async function ensureFreshRates(baseCurrency) {
  const base = baseCurrency.toUpperCase();
  const stale = !cache.fetchedAt || (Date.now() - cache.fetchedAt) > CACHE_TTL_MS;
  const wrongBase = cache.base && cache.base !== base;

  if (stale || wrongBase) {
    await fetchRates(base);
  }
}

// ── convert(amount, from, to) ─────────────────────────────────────────────────
// Converts `amount` from currency `from` to currency `to`.
// Both from and to should be ISO 4217 strings (e.g. 'USD', 'IDR').
// The cache is keyed to `to` (the base currency), so this works best when
// `to` matches the streamer's base currency and `from` is the donor's currency.
async function convert(amount, from, to) {
  from = from.toUpperCase();
  to   = to.toUpperCase();

  if (from === to) return amount;

  await ensureFreshRates(to);

  // cache.rates contains rates relative to `to` as the base (1 unit of `to` = X of other)
  // So to convert FROM → TO: result = amount / rates[from]
  // e.g. cache base = IDR, rates.USD = 0.000062
  //   $5 USD → IDR: 5 / 0.000062 ≈ 80,645 IDR  ✓
  const rate = cache.rates[from];
  if (!rate) {
    throw new Error(`No rate found for ${from} (base: ${to})`);
  }

  const result = Math.round(amount / rate);
  return result;
}

// ── getCache() ────────────────────────────────────────────────────────────────
function getCache() {
  return {
    base     : cache.base,
    rates    : cache.rates,
    fetchedAt: cache.fetchedAt,
  };
}

// ── prewarm(baseCurrency) ─────────────────────────────────────────────────────
// Kicks off a background rate fetch so the first real donation doesn't wait.
function prewarm(baseCurrency) {
  fetchRates(baseCurrency).catch(err => {
    console.warn(`[currency] prewarm failed: ${err.message}`);
  });
}

module.exports = { convert, getCache, prewarm };
