// ── server/webhooks/trakteer.js ───────────────────────────────────────────────
// Handles incoming donation webhooks from Trakteer.
//
// Auth: X-Webhook-Token header
// Set in .env as: TRAKTEER_SECRET=your_token
// Found at: Trakteer dashboard → Integrasi → Webhook → token field
//
// NOTE: Trakteer's test payload contains JS-style comments in the JSON
// which makes it invalid JSON. We strip comments before parsing so the
// test button works. Real donations won't have this issue.
// -----------------------------------------------------------------------------

const crypto = require('crypto');

function verifyToken(req) {
  const token    = process.env.TRAKTEER_SECRET || '';
  const incoming = req.headers['x-webhook-token'] || '';

  if (!token) {
    console.warn('[trakteer] TRAKTEER_SECRET not set in .env — skipping verification');
    return true;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming, 'utf8'),
      Buffer.from(token,    'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Strip JS-style single-line comments from a JSON string.
 * Trakteer's test payload includes comments like // ID gif selection
 * which break standard JSON.parse().
 */
function stripComments(str) {
  return str.replace(/\/\/[^\n\r"]*/g, '');
}

function parseDonation(body) {
  if (!body || body.type !== 'tip') return null;

  const pricePerUnit = parseFloat(body.price)  || 0;
  const quantity     = parseInt(body.quantity) || 1;

  return {
    platform : 'trakteer',
    name     : body.supporter_name    || 'Anonymous',
    amount   : pricePerUnit * quantity,
    currency : 'IDR',
    message  : body.supporter_message || '',
    invoiceId: body.transaction_id    || '',
  };
}

function trakteerHandler(processDonation) {
  return (req, res) => {
    try {
      // 1. Verify token
      if (!verifyToken(req)) {
        console.warn('[trakteer] invalid token — request rejected');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 2. Parse body — req.body may be undefined if express.json() rejected
      //    the payload due to JS comments in Trakteer's test request.
      //    Fall back to manually parsing req.rawBody with comments stripped.
      let body = req.body;

      if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
        if (req.rawBody) {
          try {
            const cleaned = stripComments(req.rawBody.toString('utf8'));
            body = JSON.parse(cleaned);
            console.log('[trakteer] parsed via comment-stripped fallback');
          } catch (e) {
            console.error('[trakteer] could not parse body even after stripping comments:', e.message);
            // Still return 200 so Trakteer doesn't disable the webhook
            return res.status(200).json({ ok: false, error: 'unparseable body' });
          }
        } else {
          console.warn('[trakteer] empty body received');
          return res.status(200).json({ ok: false, error: 'empty body' });
        }
      }

      console.log('[trakteer] raw payload:', JSON.stringify(body, null, 2));

      // 3. Parse into unified donation object
      const donation = parseDonation(body);
      if (!donation) {
        console.log('[trakteer] non-tip event, skipping. type:', body?.type);
        return res.status(200).json({ ok: true, processed: false });
      }

      // 4. Process
      console.log(`[trakteer] donation from ${donation.name} — IDR ${donation.amount.toLocaleString()} (${body.quantity}× ${body.unit || 'item'} @ IDR ${body.price})`);
      processDonation(donation);

      return res.status(200).json({ ok: true, processed: true });

    } catch (err) {
      // Always 200 — returning >=300 causes Trakteer to retry 3× then disable the webhook
      console.error('[trakteer] unexpected error:', err.message);
      return res.status(200).json({ ok: false, error: err.message });
    }
  };
}

module.exports = trakteerHandler;
