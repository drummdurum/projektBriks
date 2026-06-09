const express = require('express');
const bcrypt = require('bcrypt');
const { prisma } = require('../database/prisma');
const { sendBookingFinalConfirmation, sendBookingCancellation } = require('../utils/email');
const router = express.Router();

const isDbUnavailableError = (error) => {
    const code = error?.code;
    const message = String(error?.message || '').toLowerCase();

    return (
        code === 'P1001' ||
        code === 'P1002' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        message.includes("can't reach database server") ||
        message.includes('connection') && message.includes('timed out')
    );
};

const modelMissing = (modelKey) => !prisma || !prisma[modelKey];

const sendDbError = (res, fallbackMessage, error) => {
    if (isDbUnavailableError(error)) {
        return res.status(503).json({
            success: false,
            message: 'Databasen er midlertidigt utilgængelig. Prøv igen om lidt.'
        });
    }

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
        error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
};

// Middleware to check if user is authenticated as admin
const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.isAdmin) {
        return res.status(401).json({ success: false, message: 'Adgang nægtet' });
    }
    next();
};

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // For now, use environment variables for admin credentials
        // In production, these should be stored in database with hashed passwords
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'birgitte2025';
        
        if (username === adminUsername && password === adminPassword) {
            req.session.isAdmin = true;
            req.session.adminUser = { username };

            return req.session.save((sessionError) => {
                if (sessionError) {
                    console.error('Admin login session save error:', sessionError);
                    return res.status(503).json({
                        success: false,
                        message: 'Login midlertidigt utilgængeligt. Prøv igen om lidt.'
                    });
                }

                res.json({
                    success: true,
                    user: { username }
                });
            });
        } else {
            res.status(401).json({ 
                success: false, 
                message: 'Ugyldig brugernavn eller adgangskode' 
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server fejl' 
        });
    }
});

// Admin logout
router.post('/logout', (req, res) => {
    if (!req.session) {
        return res.json({ success: true });
    }

    req.session.destroy((error) => {
        if (error) {
            console.error('Admin logout session destroy error:', error);
            return res.status(500).json({ success: false, message: 'Kunne ikke logge ud' });
        }

        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Check authentication status
router.get('/auth-status', (req, res) => {
    res.json({
        authenticated: !!req.session.isAdmin,
        user: req.session.adminUser || null
    });
});

// Get all bookings
router.get('/bookings', requireAdmin, async (req, res) => {
    try {
        if (modelMissing('booking')) {
            return res.status(503).json({
                success: false,
                message: 'Booking-data er ikke tilgængelig. Kør database migration og deploy igen.'
            });
        }

        const bookings = await prisma.booking.findMany({
            orderBy: { created_at: 'desc' }
        });
        
        // Ensure we're returning a proper array
        if (!Array.isArray(bookings)) {
            console.warn('Warning: bookings response is not an array:', typeof bookings);
            return res.json([]);
        }
        
        // Convert Date objects to ISO strings for JSON serialization
        const serializedBookings = bookings.map(booking => ({
            ...booking,
            ønsket_dato: booking.ønsket_dato ? new Date(booking.ønsket_dato).toISOString().split('T')[0] : null,
            created_at: booking.created_at ? booking.created_at.toISOString() : null,
            updated_at: booking.updated_at ? booking.updated_at.toISOString() : null
        }));
        
        res.json(serializedBookings);
    } catch (error) {
        console.error('Error fetching bookings - Details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        return sendDbError(res, 'Fejl ved hentning af bookinger', error);
    }
});

// Create manual booking
router.post('/bookings', requireAdmin, async (req, res) => {
    try {
        const {
            navn,
            telefon,
            email,
            ønsket_dato,
            ønsket_tid,
            behandling = 'Kropsterapi',
            betaling = 'Enkelt behandling (785 kr.)',
            besked,
            status = 'confirmed'
        } = req.body;
        
        // Validate required fields
        if (!navn || !telefon || !ønsket_dato || !ønsket_tid) {
            return res.status(400).json({
                success: false,
                message: 'Alle påkrævede felter skal udfyldes'
            });
        }
        
        // Check for conflicts
        const conflictCheck = await prisma.booking.findFirst({
            where: {
                ønsket_dato: new Date(ønsket_dato),
                ønsket_tid,
                NOT: { status: 'cancelled' }
            }
        });
        
        if (conflictCheck) {
            return res.status(400).json({
                success: false,
                message: 'Der er allerede en booking på dette tidspunkt'
            });
        }
        
        // Check if date is blocked
        const blockCheck = await prisma.blockedDate.findFirst({
            where: {
                AND: [
                    { start_date: { lte: new Date(ønsket_dato) } },
                    { end_date: { gte: new Date(ønsket_dato) } }
                ]
            }
        });
        
        if (blockCheck) {
            return res.status(400).json({
                success: false,
                message: 'Denne dato er blokeret og kan ikke bookes'
            });
        }

        // Check if time is blocked
        const blockTimeCheck = await prisma.blockedTime.findFirst({
            where: {
                date: new Date(ønsket_dato),
                time: ønsket_tid
            }
        });

        if (blockTimeCheck) {
            return res.status(400).json({
                success: false,
                message: 'Dette tidspunkt er blokeret og kan ikke bookes'
            });
        }
        
        // Insert booking
        const booking = await prisma.booking.create({
            data: {
                navn,
                telefon,
                email: email || null,
                ønsket_dato: new Date(ønsket_dato),
                ønsket_tid,
                behandling,
                betaling,
                besked: typeof besked === 'string' ? besked.trim() : '',
                status,
                created_by_admin: true
            }
        });
        
        // Convert Date objects to ISO strings
        const serializedBooking = {
            ...booking,
            ønsket_dato: booking.ønsket_dato ? new Date(booking.ønsket_dato).toISOString().split('T')[0] : null,
            created_at: booking.created_at ? booking.created_at.toISOString() : null,
            updated_at: booking.updated_at ? booking.updated_at.toISOString() : null
        };
        
        res.json({
            success: true,
            booking: serializedBooking,
            message: 'Manuel booking oprettet succesfuldt'
        });
        
    } catch (error) {
        console.error('Error creating manual booking:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved oprettelse af booking'
        });
    }
});

// Update booking status
router.put('/bookings/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const updateData = { status };
        if (status === 'completed') updateData.completed = true;

        const booking = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking ikke fundet'
            });
        }
        
        // Convert Date objects to ISO strings
            const serializedBooking = {
            ...booking,
            ønsket_dato: booking.ønsket_dato ? new Date(booking.ønsket_dato).toISOString().split('T')[0] : null,
            created_at: booking.created_at ? booking.created_at.toISOString() : null,
            updated_at: booking.updated_at ? booking.updated_at.toISOString() : null
        };

        // If booking was just confirmed, send final confirmation email to customer (do not fail on email errors)
        if (status === 'confirmed') {
            (async () => {
                try {
                    await sendBookingFinalConfirmation({
                        navn: serializedBooking.navn,
                        email: serializedBooking.email,
                        telefon: serializedBooking.telefon,
                        ønsket_dato: serializedBooking.ønsket_dato,
                        ønsket_tid: serializedBooking.ønsket_tid,
                        behandling_type: serializedBooking.behandling_type,
                        besked: serializedBooking.besked,
                        bookingId: serializedBooking.id
                    });
                } catch (emailErr) {
                    console.error('Error sending final confirmation email:', emailErr);
                }
            })();
        }

        // If booking was just cancelled, send cancellation email to customer (do not fail on email errors)
        if (status === 'cancelled' && serializedBooking.email) {
            (async () => {
                try {
                    await sendBookingCancellation({
                        navn: serializedBooking.navn,
                        email: serializedBooking.email,
                        telefon: serializedBooking.telefon,
                        ønsket_dato: serializedBooking.ønsket_dato,
                        ønsket_tid: serializedBooking.ønsket_tid,
                        behandling_type: serializedBooking.behandling_type,
                        besked: serializedBooking.besked,
                        bookingId: serializedBooking.id
                    });
                } catch (emailErr) {
                    console.error('Error sending cancellation email:', emailErr);
                }
            })();
        }

        res.json({
            success: true,
            booking: serializedBooking,
            message: `Booking ${status === 'confirmed' ? 'bekræftet' : 'annulleret'}`
        });
        
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved opdatering af booking'
        });
    }
});

// Update booking note (besked)
router.put('/bookings/:id/note', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const besked = req.body?.besked ?? req.body?.note;

        if (typeof besked !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Note skal være tekst'
            });
        }

        const trimmed = besked.trim();

        if (trimmed.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Note må maks være 2000 tegn'
            });
        }

        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { besked: trimmed }
        });

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Booking ikke fundet'
            });
        }

        return res.json({
            success: true,
            message: 'Note opdateret'
        });
    } catch (error) {
        console.error('Error updating booking note:', error);
        return res.status(500).json({
            success: false,
            message: 'Fejl ved opdatering af note'
        });
    }
});

// Trigger sending final confirmation email for a booking (admin)
router.post('/bookings/:id/send-final', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findUnique({ where: { id: parseInt(id) } });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking ikke fundet' });
        }

        if (!booking.email) {
            return res.status(400).json({ success: false, message: 'Booking har ingen email' });
        }

        // Send email and return result (failures reported)
        try {
            await sendBookingFinalConfirmation({
                navn: booking.navn,
                email: booking.email,
                telefon: booking.telefon,
                ønsket_dato: booking.ønsket_dato ? new Date(booking.ønsket_dato).toISOString().split('T')[0] : null,
                ønsket_tid: booking.ønsket_tid,
                behandling_type: booking.behandling_type,
                besked: booking.besked,
                bookingId: booking.id
            });

            return res.json({ success: true, message: 'Bekræftelsesmail sendt' });
        } catch (emailErr) {
            console.error('Error sending final confirmation email (admin send):', emailErr);
            return res.status(500).json({ success: false, message: 'Fejl ved afsendelse af bekræftelsesmail', error: emailErr.message });
        }

    } catch (error) {
        console.error('Error in send-final route:', error);
        res.status(500).json({ success: false, message: 'Serverfejl' });
    }
});

// Get blocked dates
router.get('/blocked-dates', requireAdmin, async (req, res) => {
    try {
        if (modelMissing('blockedDate')) {
            console.warn('blockedDate model missing on prisma client - returning empty list');
            return res.json([]);
        }

        const blockedDates = await prisma.blockedDate.findMany({
            orderBy: { start_date: 'asc' }
        });
        
        // Ensure we're returning a proper array
        if (!Array.isArray(blockedDates)) {
            console.warn('Warning: blockedDates response is not an array:', typeof blockedDates);
            return res.json([]);
        }
        
        // Convert Date objects to ISO strings for JSON serialization
        const serializedBlockedDates = blockedDates.map(blocked => ({
            ...blocked,
            start_date: blocked.start_date ? new Date(blocked.start_date).toISOString().split('T')[0] : null,
            end_date: blocked.end_date ? new Date(blocked.end_date).toISOString().split('T')[0] : null,
            created_at: blocked.created_at ? blocked.created_at.toISOString() : null
        }));
        
        res.json(serializedBlockedDates);
    } catch (error) {
        console.error('Error fetching blocked dates - Details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        return sendDbError(res, 'Fejl ved hentning af blokerede datoer', error);
    }
});

// Attach mail router (Resend support)
router.use('/mail', require('./mail'));


// Block date/period
router.post('/blocked-dates', requireAdmin, async (req, res) => {
    try {
        const { startDate, endDate, reason } = req.body;
        
        if (!startDate) {
            return res.status(400).json({
                success: false,
                message: 'Startdato er påkrævet'
            });
        }
        
        // If no end date provided, use start date
        const finalEndDate = endDate || startDate;
        
        // Validate dates
        if (new Date(startDate) > new Date(finalEndDate)) {
            return res.status(400).json({
                success: false,
                message: 'Slutdato kan ikke være før startdato'
            });
        }
        
        // Check for existing bookings in the blocked period
        const existingBookings = await prisma.booking.count({
            where: {
                ønsket_dato: {
                    gte: new Date(startDate),
                    lte: new Date(finalEndDate)
                },
                NOT: { status: 'cancelled' }
            }
        });
        
        if (existingBookings > 0) {
            return res.status(400).json({
                success: false,
                message: `Der er ${existingBookings} eksisterende booking(er) i denne periode. Annuller dem først.`
            });
        }
        
        // Insert blocked period
        const blockedDate = await prisma.blockedDate.create({
            data: {
                start_date: new Date(startDate),
                end_date: new Date(finalEndDate),
                reason: reason || null
            }
        });
        
        // Convert Date objects to ISO strings
        const serializedBlockedDate = {
            ...blockedDate,
            start_date: blockedDate.start_date ? new Date(blockedDate.start_date).toISOString().split('T')[0] : null,
            end_date: blockedDate.end_date ? new Date(blockedDate.end_date).toISOString().split('T')[0] : null,
            created_at: blockedDate.created_at ? blockedDate.created_at.toISOString() : null
        };
        
        res.json({
            success: true,
            blockedDate: serializedBlockedDate,
            message: 'Periode blokeret succesfuldt'
        });
        
    } catch (error) {
        console.error('Error blocking date:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved blokering af dato'
        });
    }
});

// Remove blocked date
router.delete('/blocked-dates/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedDate = await prisma.blockedDate.delete({
            where: { id: parseInt(id) }
        });
        
        if (!deletedDate) {
            return res.status(404).json({
                success: false,
                message: 'Blokeret periode ikke fundet'
            });
        }
        
        res.json({
            success: true,
            message: 'Blokeret periode fjernet succesfuldt'
        });
        
    } catch (error) {
        console.error('Error removing blocked date:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved fjernelse af blokeret periode'
        });
    }
});

// Get blocked times
router.get('/blocked-times', requireAdmin, async (req, res) => {
    try {
        if (modelMissing('blockedTime')) {
            console.warn('blockedTime model missing on prisma client - returning empty list');
            return res.json([]);
        }

        const blockedTimes = await prisma.blockedTime.findMany({
            orderBy: [{ date: 'asc' }, { time: 'asc' }]
        });

        if (!Array.isArray(blockedTimes)) {
            console.warn('Warning: blockedTimes response is not an array:', typeof blockedTimes);
            return res.json([]);
        }

        const serialized = blockedTimes.map(blocked => ({
            ...blocked,
            date: blocked.date ? new Date(blocked.date).toISOString().split('T')[0] : null,
            created_at: blocked.created_at ? blocked.created_at.toISOString() : null
        }));

        res.json(serialized);
    } catch (error) {
        console.error('Error fetching blocked times:', error);
        return sendDbError(res, 'Fejl ved hentning af blokerede tidspunkter', error);
    }
});

// Block specific time on a date
router.post('/blocked-times', requireAdmin, async (req, res) => {
    try {
        const { date, time, reason } = req.body;

        if (!date || !time) {
            return res.status(400).json({
                success: false,
                message: 'Dato og tidspunkt er påkrævet'
            });
        }

        // Check if date is blocked entirely
        const blockCheck = await prisma.blockedDate.findFirst({
            where: {
                AND: [
                    { start_date: { lte: new Date(date) } },
                    { end_date: { gte: new Date(date) } }
                ]
            }
        });

        if (blockCheck) {
            return res.status(400).json({
                success: false,
                message: 'Denne dato er allerede blokeret som hel dag'
            });
        }

        // Check for existing booking at that time
        const existingBooking = await prisma.booking.findFirst({
            where: {
                ønsket_dato: new Date(date),
                ønsket_tid: time,
                NOT: { status: 'cancelled' }
            }
        });

        if (existingBooking) {
            return res.status(400).json({
                success: false,
                message: 'Der er allerede en booking på dette tidspunkt'
            });
        }

        const existingBlocked = await prisma.blockedTime.findFirst({
            where: {
                date: new Date(date),
                time
            }
        });

        if (existingBlocked) {
            return res.status(400).json({
                success: false,
                message: 'Dette tidspunkt er allerede blokeret'
            });
        }

        const blockedTime = await prisma.blockedTime.create({
            data: {
                date: new Date(date),
                time,
                reason: reason || null
            }
        });

        const serialized = {
            ...blockedTime,
            date: blockedTime.date ? new Date(blockedTime.date).toISOString().split('T')[0] : null,
            created_at: blockedTime.created_at ? blockedTime.created_at.toISOString() : null
        };

        res.json({
            success: true,
            blockedTime: serialized,
            message: 'Tidspunkt blokeret succesfuldt'
        });
    } catch (error) {
        console.error('Error blocking time:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved blokering af tidspunkt'
        });
    }
});

// Remove blocked time
router.delete('/blocked-times/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const deletedTime = await prisma.blockedTime.delete({
            where: { id: parseInt(id) }
        });

        if (!deletedTime) {
            return res.status(404).json({
                success: false,
                message: 'Blokeret tidspunkt ikke fundet'
            });
        }

        res.json({
            success: true,
            message: 'Blokeret tidspunkt fjernet succesfuldt'
        });
    } catch (error) {
        console.error('Error removing blocked time:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved fjernelse af blokeret tidspunkt'
        });
    }
});

// POST /api/admin/import-users - Import users from list
router.post('/import-users', requireAdmin, async (req, res) => {
    try {
        const { users } = req.body;

        if (!Array.isArray(users) || users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Ugyldig brugerliste'
            });
        }

        let created = 0;
        let skipped = 0;
        const errors = [];

        for (const user of users) {
            try {
                if (!user.navn || !user.telefon) {
                    errors.push(`Manglende navn eller telefon for bruger`);
                    continue;
                }

                const existingUser = await prisma.user.findFirst({
                    where: { telefon: user.telefon }
                });

                if (existingUser) {
                    skipped++;
                } else {
                    await prisma.user.create({
                        data: {
                            navn: user.navn,
                            efternavn: user.efternavn || '',
                            email: user.email || 'test@test.dk',
                            telefon: user.telefon
                        }
                    });
                    created++;
                }
            } catch (err) {
                errors.push(`${user.navn}: ${err.message}`);
            }
        }

        res.json({
            success: true,
            message: `Import gennemført: ${created} oprettet, ${skipped} eksisterede allerede`,
            created,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Import users error:', error);
        res.status(500).json({
            success: false,
            message: 'Fejl ved import af brugere'
        });
    }
});

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
    try {
        if (modelMissing('user')) {
            console.warn('user model missing on prisma client - returning empty users list');
            return res.json({ success: true, users: [] });
        }

        const users = await prisma.user.findMany({
            orderBy: [{ navn: 'asc' }, { efternavn: 'asc' }]
        });
        
        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        return sendDbError(res, 'Fejl ved hentning af brugere', error);
    }
});

// Create single user
router.post('/users', requireAdmin, async (req, res) => {
    try {
        if (modelMissing('user')) {
            return res.status(503).json({
                success: false,
                message: 'Bruger-data er ikke tilgængelig. Kør database migration og deploy igen.'
            });
        }

        const { navn, efternavn, telefon, email } = req.body;

        if (!navn || !efternavn || !telefon) {
            return res.status(400).json({
                success: false,
                message: 'Fornavn, efternavn og telefon er påkrævet'
            });
        }

        const existingByPhone = await prisma.user.findFirst({
            where: { telefon }
        });

        if (existingByPhone) {
            return res.status(409).json({
                success: false,
                message: 'En bruger med dette telefonnummer findes allerede'
            });
        }

        if (email) {
            const existingByEmail = await prisma.user.findFirst({
                where: { email }
            });

            if (existingByEmail) {
                return res.status(409).json({
                    success: false,
                    message: 'En bruger med denne email findes allerede'
                });
            }
        }

        const user = await prisma.user.create({
            data: {
                navn: navn.trim(),
                efternavn: efternavn.trim(),
                telefon: telefon.trim(),
                email: email ? email.trim() : null
            }
        });

        res.status(201).json({
            success: true,
            user,
            message: 'Bruger oprettet'
        });
    } catch (error) {
        console.error('Create user error:', error);
        return sendDbError(res, 'Fejl ved oprettelse af bruger', error);
    }
});

// Update user
router.put('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { navn, efternavn, email, telefon } = req.body;
        
        if (!navn || !efternavn || !telefon) {
            return res.status(400).json({
                success: false,
                message: 'Navn, efternavn og telefon er påkrævet'
            });
        }
        
        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                navn: navn.trim(),
                efternavn: efternavn.trim(),
                email: email && email.trim() ? email.trim() : null,
                telefon: telefon.trim()
            }
        });
        
        res.json({
            success: true,
            message: 'Bruger opdateret succesfuldt',
            user: user
        });
    } catch (error) {
        console.error('Update user error:', error);
        
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'Email og telefon kombinationen findes allerede'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Fejl ved opdatering af bruger'
        });
    }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);

        if (!Number.isInteger(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Ugyldigt bruger-id'
            });
        }

        await prisma.user.delete({
            where: { id: userId }
        });

        return res.json({
            success: true,
            message: 'Bruger slettet'
        });
    } catch (error) {
        console.error('Delete user error:', error);

        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                message: 'Bruger ikke fundet'
            });
        }

        return sendDbError(res, 'Fejl ved sletning af bruger', error);
    }
});

module.exports = router;
