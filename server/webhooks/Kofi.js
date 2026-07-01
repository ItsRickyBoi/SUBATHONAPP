// ── server/webhooks/kofi.js ───────────────────────────────────────────────────
// Handles incoming donation webhooks from Ko-fi.
//
// Auth method: verification_token field INSIDE the payload (not a header).
// Ko-fi sends the same token you set in your dashboard with every request.
// Set in .env as: KOFI_TOKEN=your-verification-token-uuid
// Found at: ko-fi.com/manage/webhooks → your verification token
//
// IMPORTANT — Ko-fi sends as application/x-www-form-urlencoded, NOT JSON.
// The actual payload is a JSON string in a field called "data".
// We need express.urlencoded() middleware on this route (not express.json()).
//
// Payload shape (inside the "data" field, after JSON.parse):
// {
//   "verification_token":          "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
//   "message_id":                  "b54fa6ec-07c9-44aa-be0e-b0f4095d9145",
//   "timestamp":                   "2023-07-29T16:27:32Z",
//   "type":                        "Donation",
//   "is_public":                   true,
//   "from_name":                   "Jo Example",
//   "message":                     "Good luck with the integration!",
//   "amount":                      "3.00",       <- STRING not number
//   "currency":                    "USD",
//   "is_subscription_payment":     false,
//   "is_first_subscription_payment": false,
//   "kofi_transaction_id":         "00000000-1111-2222-3333-444444444444",
//   "email":                       "jo@example.com",
//   "shop_items":                  null,
//   "tier_name":                   null,
//   "shipping":                    null
// }
// -----------------------------------------------------------------------------

const crypto = require('crypto');

function verifyToken(payload, expectedToken) {
  if (!expectedToken) {
    console.warn('[kofi] KOFI_TOKEN not set in .env — skipping verification');
    return true;
  }

  const incoming = payload.verification_token || '';

  try {
    return crypto.timingSafeEqual(
      Buffer.from(incoming,      'utf8'),
      Buffer.from(expectedToken, 'utf8')
    );
  } catch {
    return false; // buffers were different lengths
  }
}

function parseDonation(payload) {
  // Only process one-time donations and subscription payments
  // Ko-fi type is "Donation", "Subscription", or "Shop Order"
  const type = (payload.type || '').toLowerCase();
  if (type !== 'donation' && type !== 'subscription') return null;

  return {
    platform : 'kofi',
    name     : payload.from_name || 'Anonymous',
    amount   : parseFloat(payload.amount) || 0,   // convert "3.00" → 3.00
    currency : (payload.currency || 'USD').toUpperCase(),
    message  : payload.message || '',
    invoiceId: payload.kofi_transaction_id || payload.message_id || '',
  };
}

/**
 * Express route handler — mount at POST /webhook/kofi
 *
 * MUST be mounted BEFORE express.json() can interfere — we handle the
 * urlencoded body ourselves using express.urlencoded() on this specific route.
 *
 * Usage in server/index.js:
 *   const kofi = require('./webhooks/kofi');
 *   app.post('/webhook/kofi',
 *     express.urlencoded({ extended: true }),
 *     kofi(handleDonation)
 *   );
 */
function kofiHandler(processDonation) {
  return (req, res) => {
    try {
      // 1. Ko-fi sends form data with a "data" field containing a JSON string
      const raw = req.body?.data;
      if (!raw) {
        console.warn('[kofi] no "data" field in request body');
        return res.status(200).json({ ok: false, error: 'missing data field' });
      }

      // 2. Parse the JSON string
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        console.warn('[kofi] failed to parse data field as JSON:', e.message);
        return res.status(200).json({ ok: false, error: 'invalid JSON in data field' });
      }

      console.log('[kofi] raw payload:', JSON.stringify(payload, null, 2));

      // 3. Verify token
      const expectedToken = process.env.KOFI_TOKEN || '';
      if (!verifyToken(payload, expectedToken)) {
        console.warn('[kofi] invalid verification_token — request rejected');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 4. Parse into unified donation object
      const donation = parseDonation(payload);
      if (!donation) {
        console.log('[kofi] non-donation event, skipping. type:', payload.type);
        return res.status(200).json({ ok: true, processed: false });
      }

      // 5. Process
      console.log(`[kofi] donation from ${donation.name} — ${donation.currency} ${donation.amount}`);
      processDonation(donation);

      // 6. Always return 200 — Ko-fi retries if it doesn't get one
      return res.status(200).json({ ok: true, processed: true });

    } catch (err) {
      console.error('[kofi] unexpected error:', err.message);
      return res.status(200).json({ ok: false, error: err.message });
    }
  };
}

module.exports = kofiHandler;
