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
router.post('/', bookingLimiter, bookingValidation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Ugyldige data',
        details: errors.array()
      });
    }

    const {
      navn,
      email,
      telefon,
      ønsket_dato,
      ønsket_tid,
      behandling = 'Kropsterapi',
      betaling = 'Enkelt behandling (785 kr.)',
      besked,
      gdpr_samtykke
    } = req.body;

    // Check if the requested date is a weekend
    if (ønsket_dato) {
      const requestedDate = new Date(ønsket_dato);
      const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 6 = Saturday
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return res.status(400).json({
          error: 'Booking i weekenden er ikke mulig. Vælg venligst en hverdag (mandag-fredag).'
        });
      }
    }

    // Check if the requested date is blocked
    if (ønsket_dato) {
      const blockedCheck = await prisma.blockedDate.findFirst({
        where: {
          AND: [
            { start_date: { lte: new Date(ønsket_dato) } },
            { end_date: { gte: new Date(ønsket_dato) } }
          ]
        }
      });
      
      if (blockedCheck) {
        return res.status(400).json({
          error: 'Den valgte dato er ikke tilgængelig for booking. Vælg venligst en anden dato.'
        });
      }
    }

    // Check if the requested time is blocked
    if (ønsket_dato && ønsket_tid) {
      const blockedTimeCheck = await prisma.blockedTime.findFirst({
        where: {
          date: new Date(ønsket_dato),
          time: ønsket_tid
        }
      });

      if (blockedTimeCheck) {
        return res.status(400).json({
          error: 'Det valgte tidspunkt er blokeret. Vælg venligst et andet tidspunkt.'
        });
      }
    }

    // Check for time conflicts
    if (ønsket_dato && ønsket_tid) {
      const conflictCheck = await prisma.booking.findFirst({
        where: {
          ønsket_dato: new Date(ønsket_dato),
          ønsket_tid,
          NOT: { status: 'cancelled' }
        }
      });
      
      if (conflictCheck) {
        return res.status(400).json({
          error: 'Det valgte tidspunkt er allerede optaget. Vælg venligst et andet tidspunkt.'
        });
      }
    }

    // Create or get user
    let user;
    try {
      if (prisma.user && typeof prisma.user.upsert === 'function') {
        const navnParts = navn.split(' ');
        const firstName = navnParts[0];
        const lastName = navnParts.slice(1).join(' ');

        user = await prisma.user.upsert({
          where: {
            email_telefon: {
              email: email || null,
              telefon: telefon
            }
          },
          update: {
            navn: firstName,
            efternavn: lastName,
            email: email || null
          },
          create: {
            navn: firstName,
            efternavn: lastName,
            email: email || null,
            telefon
          }
        });
      }
    } catch (userErr) {
      console.error('User creation/update error:', userErr);
      // Continue without user ID if user creation fails
    }

    // Insert booking into database
    let booking;
    try {
      booking = await prisma.booking.create({
        data: {
          navn,
          email,
          telefon,
          ønsket_dato: ønsket_dato ? new Date(ønsket_dato) : null,
          ønsket_tid,
          behandling: 'Kropsterapi',
          betaling,
          besked,
          gdpr_samtykke: gdpr_samtykke === 'true' || gdpr_samtykke === true,
          userId: user?.id || null
        }
      });
    } catch (createErr) {
      // Handle unique constraint violations (Prisma error code P2002 or SQL duplicate key)
      if ((createErr && createErr.code === 'P2002') || (createErr && /duplicate key/i.test(createErr.message))) {
        return res.status(400).json({
          error: 'Det valgte tidspunkt er allerede optaget. Vælg venligst et andet tidspunkt.'
        });
      }

      // Otherwise rethrow to be handled by outer catch
      throw createErr;
    }

    // Send emails
    try {
      await Promise.all([
        sendBookingConfirmation({
          navn,
          email,
          telefon,
          ønsket_dato,
          ønsket_tid,
          behandling: 'Kropsterapi',
          betaling,
          besked,
          bookingId: booking.id
        }),
        sendBookingNotification({
          navn,
          email,
          telefon,
          ønsket_dato,
          ønsket_tid,
          behandling: 'Kropsterapi',
          betaling,
          besked,
          bookingId: booking.id,
          created_at: booking.created_at
        })
      ]);
    } catch (emailError) {
      console.error('Email error:', emailError);
      // Don't fail the booking if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Din booking er modtaget! Du vil høre fra os snarest.',
      bookingId: booking.id
    });

  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({
      error: 'Der opstod en fejl ved oprettelse af booking. Prøv igen eller ring på 21 85 34 17.'
    });
  }
});

// PUT /api/bookings/:id/status - Update booking status
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
