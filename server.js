const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import database and routes
const { prisma, pool, testConnection } = require('./database/prisma');
const { initDatabase } = require('./database/init');
const bookingsRouter = require('./routes/bookings');
const pagesRouter = require('./routes/pages');
const { syncGoogleCalendar } = require('./utils/googleCalendar');
const { getRefreshToken } = require('./utils/calendarToken');

const app = express();
const PORT = process.env.PORT || 3000;
const sessionStoreType = (process.env.SESSION_STORE || 'memory').toLowerCase();
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      mediaSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.RAILWAY_STATIC_URL, 'https://birgittesbriks.up.railway.app']
    : 'http://localhost:3000',
  credentials: true
}));

// Trust proxy for Railway deployment
if (isProduction) {
  app.set('trust proxy', 1);
}

// Rate limiting (only for API routes in production)
if (isProduction) {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 300,
    message: {
      success: false,
      message: 'For mange requests, prøv igen senere.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api', apiLimiter);
} else {
  console.log('🧪 Development mode: global API rate limit disabled');
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
let sessionStore;

if (sessionStoreType === 'postgres') {
  const pgStore = new pgSession({
    pool,
    tableName: 'session'
  });

  pgStore.on('error', (error) => {
    console.error('Session store error (PostgreSQL):', error.message);
  });

  sessionStore = pgStore;
  console.log('🗄️ Session store: PostgreSQL');
} else {
  sessionStore = new session.MemoryStore();
  console.warn('⚠️ Session store: MemoryStore (ikke persistent mellem restarts)');
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/bookings', bookingsRouter);
app.use('/api/admin', require('./routes/admin'));
// Public mail endpoints (for sending test/confirmation mails from public UI)
app.use('/api/mail', require('./routes/publicMail'));
// Availability endpoint to check booked times for a date
app.use('/api/availability', require('./routes/availability'));
app.use('/api/calendar', require('./routes/googleCalendar'));

// Page routes
app.use('/', pagesRouter);

// Public API for blocked dates (for booking form)
app.get('/api/blocked-dates', async (req, res) => {
    try {
        const blockedDates = await prisma.blockedDate.findMany({
            orderBy: { start_date: 'asc' },
            select: {
                start_date: true,
                end_date: true
            }
        });
        
        // Convert Date objects to ISO strings
        const serializedBlockedDates = blockedDates.map(blocked => ({
            start_date: blocked.start_date ? new Date(blocked.start_date).toISOString().split('T')[0] : null,
            end_date: blocked.end_date ? new Date(blocked.end_date).toISOString().split('T')[0] : null
        }));
        
        res.json(serializedBlockedDates);
    } catch (error) {
        console.error('Error fetching blocked dates:', error);
        res.status(500).json({ error: 'Kunne ikke hente blokerede datoer' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Handle 404 errors
app.use('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);

  if (res.headersSent) {
    return next(err);
  }

    res.status(500).json({
        error: 'Der opstod en intern serverfejl. Prøv igen senere.'
    });
});

// Initialize database and start server
const startServer = async () => {
    try {
        // Test database connection
        await testConnection();
        
        // Initialize database schema
        try {
            await initDatabase();
            console.log('✅ Database schema verified');
        } catch (dbError) {
            console.warn('⚠️ Database initialization warning:', dbError.message);
            // Don't fail server start if database init fails
        }
        
        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🌿 Birgittes Briks website er klar på http://localhost:${PORT}`);
            console.log(`📱 Tryk Ctrl+C for at stoppe serveren`);
            console.log(`🗄️ Database: ${process.env.NODE_ENV === 'production' ? 'PostgreSQL (Railway)' : 'Local PostgreSQL'}`);
        });
        if (process.env.GOOGLE_CALENDAR_ID) {
            const refresh = async () => {
                try {
                    if (await getRefreshToken()) await syncGoogleCalendar();
                } catch (error) {
                    console.error('Periodic Google Calendar sync failed:', error);
                }
            };
            refresh();
            setInterval(refresh, 60 * 60 * 1000).unref();
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
