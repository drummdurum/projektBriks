/**
 * Positive Tests for Bookings API
 * Tests expected success scenarios
 */
require('../__tests__/setup');
const request = require('supertest');
const express = require('express');
const bookingsRouter = require('../routes/bookings');
const { prisma } = require('../database/prisma');

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/api/bookings', bookingsRouter);

describe('✅ POSITIVE TESTS - Bookings API Success Cases', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/bookings - Create Booking', () => {
    
    test('✅ Should create booking with all valid data', async () => {
      const validBooking = {
        navn: 'John Doe',
        email: 'john@example.com',
        telefon: '21853417',
        ønsket_dato: '2025-02-14',
        ønsket_tid: '14:00',
        betaling: 'Enkelt behandling (785 kr.)',
        besked: 'Test booking',
        gdpr_samtykke: 'true'
      };

      prisma.blockedDate.findFirst.mockResolvedValueOnce(null);
      prisma.booking.findFirst.mockResolvedValueOnce(null);
      prisma.booking.create.mockResolvedValueOnce({
        id: 1,
        ...validBooking,
        status: 'pending',
        created_at: new Date()
      });

      const response = await request(app)
        .post('/api/bookings')
        .send(validBooking);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.bookingId).toBe(1);
      expect(prisma.booking.create).toHaveBeenCalled();
    });

    test('✅ Should create booking without optional fields', async () => {
      const minimalBooking = {
        navn: 'Jane Smith',
        email: 'jane@example.com',
        telefon: '12345678',
        gdpr_samtykke: 'true'
      };

      prisma.booking.create.mockResolvedValueOnce({
        id: 2,
        ...minimalBooking,
        ønsket_dato: null,
        ønsket_tid: null,
        betaling: 'Enkelt behandling (785 kr.)',
        besked: null,
        status: 'pending',
        created_at: new Date()
      });

      const response = await request(app)
        .post('/api/bookings')
        .send(minimalBooking);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('✅ Should allow Danish characters in name', async () => {
      const bookingDanish = {
        navn: 'Søren Ærlig Østergård',
        email: 'soeren@example.com',
        telefon: '21853417',
        gdpr_samtykke: 'true'
      };

      prisma.booking.create.mockResolvedValueOnce({
        id: 3,
        ...bookingDanish,
        status: 'pending',
        created_at: new Date()
      });

      const response = await request(app)
        .post('/api/bookings')
        .send(bookingDanish);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('✅ Should handle multiple treatment types', async () => {
      const treatments = [
        'Enkelt behandling (785 kr.)',
        '3 behandlinger - klippekort (2200 kr.)',
        '10 behandlinger - klippekort (7500 kr.)'
      ];

      for (const treatment of treatments) {
        const booking = {
          navn: 'Test User',
          email: 'test@example.com',
          telefon: '12345678',
          betaling: treatment,
          gdpr_samtykke: 'true'
        };

        prisma.booking.create.mockResolvedValueOnce({
          id: 1,
          ...booking,
          status: 'pending',
          created_at: new Date()
        });

        const response = await request(app)
          .post('/api/bookings')
          .send(booking);

        expect(response.status).toBe(201);
      }
    });
  });

  describe('GET /api/bookings - Get All Bookings', () => {
    
    test('✅ Should return empty array when no bookings', async () => {
      prisma.booking.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/bookings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.bookings).toEqual([]);
    });

    test('✅ Should return all bookings sorted by creation date', async () => {
      const mockBookings = [
        {
          id: 1,
          navn: 'User 1',
          email: 'user1@example.com',
          status: 'pending',
          created_at: new Date('2025-01-28T10:00:00Z')
        },
        {
          id: 2,
          navn: 'User 2',
          email: 'user2@example.com',
          status: 'confirmed',
          created_at: new Date('2025-01-28T09:00:00Z')
        }
      ];

      prisma.booking.findMany.mockResolvedValueOnce(mockBookings);

      const response = await request(app)
        .get('/api/bookings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.bookings).toHaveLength(2);
      expect(response.body.bookings[0].id).toBe(1);
    });
  });

  describe('PUT /api/bookings/:id/status - Update Booking Status', () => {
    
    test('✅ Should update booking status to confirmed', async () => {
      prisma.booking.update.mockResolvedValueOnce({
        id: 1,
        navn: 'Test User',
        status: 'confirmed',
        created_at: new Date()
      });

      const response = await request(app)
        .put('/api/bookings/1/status')
        .send({ status: 'confirmed' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.booking.status).toBe('confirmed');
    });

    test('✅ Should update booking status to cancelled', async () => {
      prisma.booking.update.mockResolvedValueOnce({
        id: 1,
        navn: 'Test User',
        status: 'cancelled',
        created_at: new Date()
      });

      const response = await request(app)
        .put('/api/bookings/1/status')
        .send({ status: 'cancelled' });

      expect(response.status).toBe(200);
      expect(response.body.booking.status).toBe('cancelled');
    });

    test('✅ Should update booking status to completed', async () => {
      prisma.booking.update.mockResolvedValueOnce({
        id: 1,
        status: 'completed'
      });

      const response = await request(app)
        .put('/api/bookings/1/status')
        .send({ status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.booking.status).toBe('completed');
    });
  });
});
