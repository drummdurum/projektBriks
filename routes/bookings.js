const schedule = require('../public/js/booking-schedule');
const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../database/prisma');
const { sendBookingConfirmation, sendBookingNotification } = require('../utils/email');

const router = express.Router();

// Rate limiting for booking requests
const bookingLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3, // limit each IP to 3 requests per windowMs
  message: {
    error: 'For mange booking-forespørgsler. Prøv igen senere.',
    retryAfter: '15 minutter'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation rules for booking
const bookingValidation = [
  body('navn')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Navn skal være mellem 2 og 100 tegn')
    .matches(/^[a-zA-ZæøåÆØÅ\s-]+$/)
    .withMessage('Navn må kun indeholde bogstaver, mellemrum og bindestreger'),
    
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Indtast en gyldig email adresse'),
    
  body('telefon')
    .trim()
    .matches(/^[\d\s+()-]+$/)
    .isLength({ min: 8, max: 20 })
    .withMessage('Indtast et gyldigt telefonnummer'),
    
  body('ønsket_dato')
    .optional()
    .isISO8601()
    .withMessage('Indtast en gyldig dato'),
    
  body('ønsket_tid')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Tidspunkt må maks være 20 tegn'),
    
  body('behandling')
    .optional()
    .isIn(['Kropsterapi'])
    .withMessage('Vælg en gyldig behandling'),
    
  body('betaling')
    .optional()
    .isIn(['Enkelt behandling (785 kr.)', '3 behandlinger - klippekort (2200 kr.)', '10 behandlinger - klippekort (7500 kr.)'])
    .withMessage('Vælg en gyldig betalingsmulighed'),
    
  body('besked')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Besked må maks være 1000 tegn'),
    
  body('gdpr_samtykke')
    .equals('true')
    .withMessage('Du skal acceptere behandling af persondata')
];

// GET /api/bookings - Get all bookings (for admin)
router.get('/', async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        navn: true,
        email: true,
        telefon: true,
        ønsket_dato: true,
        ønsket_tid: true,
        behandling: true,
        betaling: true,
        besked: true,
        status: true,
        completed: true,
        created_at: true
      }
    });
    
    // Convert Date objects to ISO strings
    const serializedBookings = bookings.map(booking => ({
      ...booking,
      ønsket_dato: booking.ønsket_dato ? new Date(booking.ønsket_dato).toISOString().split('T')[0] : null,
      created_at: booking.created_at ? booking.created_at.toISOString() : null,
      completed: booking.completed === true
    }));
    
    res.json({
      success: true,
      bookings: serializedBookings
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({
      error: 'Der opstod en fejl ved hentning af bookinger'
    });
  }
});

// POST /api/bookings - Create new booking
router.post('/', (req, res) => {
  res.status(503).json({ success: false, error: 'Online booking er midlertidigt lukket. Kontakt os via /booking.' });
});

router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({
        error: 'Ugyldig status'
      });
    }

    const updateData = { status };
    if (status === 'completed') updateData.completed = true;

    const result = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    if (!result) {
      return res.status(404).json({
        error: 'Booking ikke fundet'
      });
    }

    // Convert Date objects to ISO strings
    const serializedBooking = {
      ...result,
      ønsket_dato: result.ønsket_dato ? new Date(result.ønsket_dato).toISOString().split('T')[0] : null,
      created_at: result.created_at ? result.created_at.toISOString() : null,
      updated_at: result.updated_at ? result.updated_at.toISOString() : null
    };

    res.json({
      success: true,
      booking: serializedBooking
    });

  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({
      error: 'Der opstod en fejl ved opdatering af booking'
    });
  }
});

// GET /api/bookings/search - Search users by phone or name
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { telefon: { contains: q } },
          { navn: { contains: q, mode: 'insensitive' } },
          { efternavn: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        navn: true,
        efternavn: true,
        email: true,
        telefon: true
      },
      take: 10
    });

    res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({
      error: 'Der opstod en fejl ved søgning'
    });
  }
});

module.exports = router;
