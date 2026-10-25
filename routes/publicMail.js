const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { sendBookingConfirmation } = require('../utils/email');
const { sendEmailResend } = require('../utils/resend');

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'For mange henvendelser. Prøv igen senere.' }
});

router.post('/contact', contactLimiter, [
  body('navn').trim().isLength({ min: 2, max: 100 }),
  body('email').isEmail().isLength({ max: 254 }),
  body('besked').trim().isLength({ min: 1, max: 2000 }),
  body('datoer').isArray({ max: 5 }),
  body('datoer.*').custom(value => {
    if (!value || typeof value.dato !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dato)) return false;
    if (typeof value.tid !== 'string' || (value.tid && (!/^([01]\d|2[0-3]):(00|30)$/.test(value.tid) || value.tid < '10:00' || value.tid > '19:00'))) return false;
    const date = new Date(`${value.dato}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.dato;
  }),
  body('gdpr_samtykke').custom(value => value === true)
], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    return res.status(400).json({ error: 'Kontrollér venligst felterne og prøv igen.' });
  }
  try {
    const from = process.env.RESEND_FROM || process.env.FROM_EMAIL;
    const to = process.env.NOTIFICATION_EMAIL || process.env.FROM_EMAIL;
    if (!from || !to) throw new Error('Mail addresses are not configured');
    const { navn, email, besked, datoer } = req.body;
    const datesText = datoer.length
      ? datoer.map(item => {
          const date = new Date(`${item.dato}T12:00:00Z`).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' });
          return item.tid ? `${date} kl. ${item.tid}` : date;
        }).join(', ')
      : 'Ingen angivet';
    await sendEmailResend({
      from,
      to,
      subject: 'Ny henvendelse fra hjemmesiden',
      text: `Navn: ${navn}\nE-mail: ${email}\nForeslåede datoer (ikke reserveret): ${datesText}\n\nBesked:\n${besked}`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Contact mail failed:', err);
    res.status(500).json({ error: 'Beskeden kunne ikke sendes. Ring venligst i stedet.' });
  }
});

// Rate limit: max 5 confirmation emails per hour per IP
const confirmationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'For mange email-forespørgsler fra denne IP. Prøv igen senere.'
  }
});

// POST /api/mail/confirmation
router.post('/confirmation', confirmationLimiter, [
  body('email').isEmail().withMessage('Ugyldig email'),
  body('navn').trim().isLength({ min: 2 }).withMessage('Navn skal være mindst 2 tegn')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Ugyldige data', details: errors.array() });
    }

    const { navn, email, telefon, ønsket_dato, ønsket_tid, behandling_type, besked } = req.body;

    await sendBookingConfirmation({
      navn,
      email,
      telefon: telefon || '',
      ønsket_dato: ønsket_dato || null,
      ønsket_tid: ønsket_tid || null,
      behandling_type: behandling_type || 'Enkelt behandling',
      besked: besked || null,
      bookingId: 'test' // indicate this is a test/preview email
    });

    res.json({ success: true, message: 'Bekræftelsesmail sendt (test)' });
  } catch (err) {
    console.error('Error sending confirmation email (public):', err);
    res.status(500).json({ success: false, error: 'Kunne ikke sende email. Prøv igen senere.' });
  }
});

module.exports = router;
