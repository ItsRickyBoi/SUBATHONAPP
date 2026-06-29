// ── server/webhooks/sociabuzz.js ──────────────────────────────────────────────
const crypto = require('crypto');

function verifyToken(req) {
  // .env.example uses SOCIABUZZ_SECRET, but the README tells the user to set
  // SOCIABUZZ_TOKEN — accept either so whichever one the user actually set works.
  const token = process.env.SOCIABUZZ_SECRET || process.env.SOCIABUZZ_TOKEN || '';

  // Sociabuzz can send the token either as a ?token= query param or as an
  // Authorization: Bearer header — accept either.
  const authHeader = req.headers.authorization || '';
  const fromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const incoming   = (req.query.token || fromHeader || '').trim();

  if (!token) {
    console.warn('[sociabuzz] no SOCIABUZZ_SECRET / SOCIABUZZ_TOKEN set in .env — skipping check (unsafe for production)');
    return true;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming, 'utf8'),
      Buffer.from(token,    'utf8')
    );
  } catch {
    return false; // different lengths = no match
  }
}

// Sociabuzz (and most Indonesian payment platforms) send amounts as strings
// formatted with a "." as the thousands separator, e.g. "10.000" for ten
// thousand rupiah — sometimes also with a "Rp" prefix or "," separators.
// A plain parseFloat() mangles these: parseFloat("10.000") === 10, not 10000.
// This parses both real numbers and formatted strings safely.
function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  if (raw == null) return 0;

  let str = String(raw).trim();
  if (!str) return 0;

  // Strip currency symbols/letters and whitespace, keep digits . , -
  str = str.replace(/[^\d.,-]/g, '');
  if (!str) return 0;

  const hasDot   = str.includes('.');
  const hasComma = str.includes(',');

  if (hasDot && hasComma) {
    // Whichever separator appears LAST is the decimal point; the other is
    // the thousands separator. e.g. "1.234,56" (EU) vs "1,234.56" (US).
    const lastDot   = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasDot) {
    // Only dots present. If every dot-separated group after the first is
    // exactly 3 digits, treat it as thousands separators (Indonesian style:
    // "10.000" -> 10000). Otherwise treat the single dot as a decimal point.
    const parts = str.split('.');
    const looksLikeThousands = parts.length > 1 && parts.slice(1).every(p => p.length === 3);
    str = looksLikeThousands ? parts.join('') : str;
  } else if (hasComma) {
    // Only commas present — same logic, comma as thousands separator.
    const parts = str.split(',');
    const looksLikeThousands = parts.length > 1 && parts.slice(1).every(p => p.length === 3);
    str = looksLikeThousands ? parts.join('') : str.replace(',', '.');
  }

  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

function parseDonation(body) {
  console.log('[sociabuzz] raw payload:', JSON.stringify(body, null, 2));

  if (body.status && body.status !== 'SUCCESS') {
    console.log(`[sociabuzz] skipping — status is "${body.status}"`);
    return null;
  }
  if (body.type && body.type !== 'DONATION') {
    console.log(`[sociabuzz] skipping — type is "${body.type}"`);
    return null;
  }

  const rawAmount    = body.amount;
  const parsedAmount = parseAmount(rawAmount);
  console.log(`[sociabuzz] amount parse: raw=${JSON.stringify(rawAmount)} (${typeof rawAmount}) -> parsed=${parsedAmount}`);

  return {
    platform : 'sociabuzz',
    name     : body.supporter || body.supporter_name || body.name || 'Anonymous',
    amount   : parsedAmount,
    currency : (body.currency || 'IDR').toUpperCase().trim(),
    message  : body.message || '',
    invoiceId: body.invoice || body.invoice_id || '',
  };
}

function sociabuzzHandler(processDonation) {
  return (req, res) => {
    if (!verifyToken(req)) {
      console.warn('[sociabuzz] invalid token — request rejected');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const donation = parseDonation(req.body);
    if (!donation) {
      return res.status(200).json({ ok: true, processed: false });
    }

    console.log(`[sociabuzz] donation from ${donation.name} — IDR ${donation.amount.toLocaleString()}`);
    processDonation(donation);
    res.status(200).json({ ok: true, processed: true });
  };
}

module.exports = sociabuzzHandler;
