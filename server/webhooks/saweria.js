// ── server/webhooks/saweria.js ────────────────────────────────────────────────
// Handles incoming donation webhooks from Saweria.
//
// Signature verification — from https://saweria.co/docs/webhook:
//   msg       = version + id + amount_raw + donator_name + donator_email
//   signature = HMAC-SHA256(key=streamKey, msg=msg).hexdigest()
//
// Stream Key: saweria.co/widgets/alert?streamKey=XXXX  (from your alert URL)
// Set in .env as: SAWERIA_STREAM_KEY=XXXX
//
// Payload shape:
// {
//   "version":        "2022.01",
//   "created_at":     "2021-01-01T12:00:00+00:00",
//   "id":             "00000000-...",
//   "type":           "donation",
//   "amount_raw":     69420,
//   "cut":            3471,
//   "donator_name":   "Someguy",
//   "donator_email":  "someguy@example.com",
//   "donator_is_user": false,
//   "message":        "Keep it up!",
//   "etc":            { "amount_to_display": 69420 }
// }
// -----------------------------------------------------------------------------

const crypto = require('crypto');

/**
 * Verify Saweria-Callback-Signature.
 * Signs specific fields concatenated in order — NOT the raw body.
 */
function verifySignature(body, signature, streamKey) {
  if (!signature) return false;
  if (!streamKey) {
    console.warn('[saweria] SAWERIA_STREAM_KEY not set in .env — skipping verification');
    return true;
  }

  const msg = [
    String(body.version       ?? ''),
    String(body.id            ?? ''),
    String(body.amount_raw    ?? ''),
    String(body.donator_name  ?? ''),
    String(body.donator_email ?? ''),
  ].join('');

  const expected = crypto.createHmac('sha256', streamKey).update(msg).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected,  'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Parse a Saweria webhook payload into a unified donation object.
 */
function parseDonation(body) {
  if (body.type !== 'donation') return null;

  return {
    platform : 'saweria',
    name     : body.donator_name || 'Anonymous',
    amount   : parseFloat(body.amount_raw) || 0,
    currency : 'IDR',
    message  : body.message || '',
    invoiceId: body.id || '',
  };
}

/**
 * Express route handler — mount at POST /webhook/saweria
 *
 * Usage in server/index.js:
 *   const saweria = require('./webhooks/saweria');
 *   app.post('/webhook/saweria', saweria(processDonation));
 */
function saweriaHandler(processDonation) {
  return (req, res) => {
    const body      = req.body;
    const signature = req.headers['saweria-callback-signature'] || '';
    const streamKey = process.env.SAWERIA_STREAM_KEY || '';

    // 1. Verify signature
    if (!verifySignature(body, signature, streamKey)) {
      console.warn('[saweria] invalid signature — request rejected');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[saweria] raw payload:', JSON.stringify(body, null, 2));

    // 2. Parse into unified donation object
    const donation = parseDonation(body);
    if (!donation) {
      console.log('[saweria] received non-donation event, skipping:', body.type);
      return res.status(200).json({ ok: true, processed: false });
    }

    // 3. Log and process
    console.log(`[saweria] donation from ${donation.name} — IDR ${donation.amount.toLocaleString()}`);
    processDonation(donation);

    // 4. Respond 200 quickly
    res.status(200).json({ ok: true, processed: true });
  };
}

module.exports = saweriaHandler;
