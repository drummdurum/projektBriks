const { prisma } = require('../database/prisma');

const TIMES = ['10:00', '12:00', '14:00', '16:00', '19:00'];
const BETALING_OPTIONS = [
  'Enkelt behandling (785 kr.)',
  '3 behandlinger - klippekort (2200 kr.)',
  '10 behandlinger - klippekort (7500 kr.)'
];

function toDateOnly(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function seedOldBookings() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' }
    });

    if (!users.length) {
      console.log('Ingen brugere fundet. Kør først: node scripts/import-users.js');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const date = toDateOnly(new Date(Date.now() - (i + 14) * 24 * 60 * 60 * 1000));
      const time = TIMES[i % TIMES.length];

      const existing = await prisma.booking.findFirst({
        where: {
          telefon: user.telefon,
          ønsket_dato: date,
          ønsket_tid: time
        }
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.booking.create({
        data: {
          navn: `${user.navn} ${user.efternavn}`.trim(),
          email: user.email,
          telefon: user.telefon,
          ønsket_dato: date,
          ønsket_tid: time,
          behandling: 'Kropsterapi',
          betaling: BETALING_OPTIONS[i % BETALING_OPTIONS.length],
          status: 'completed',
          completed: true,
          gdpr_samtykke: true,
          created_by_admin: true,
          userId: user.id,
          besked: 'Seedet test-booking (historisk)'
        }
      });

      created++;
    }

    console.log(`✅ Gamle bookinger seedet: ${created} oprettet, ${skipped} eksisterede allerede`);
  } catch (error) {
    console.error('Seed fejl (bookinger):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedOldBookings();
