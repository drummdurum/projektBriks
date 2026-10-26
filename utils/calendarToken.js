const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');
const { prisma } = require('../database/prisma');

function encryptionKey() {
  const hex = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be 64 hex characters');
  return Buffer.from(hex, 'hex');
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function decrypt(value) {
  const [iv, tag, ciphertext] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function saveRefreshToken(value) {
  const encrypted_refresh_token = encrypt(value);
  await prisma.googleCalendarConnection.upsert({
    where: { id: 1 },
    create: { id: 1, encrypted_refresh_token },
    update: { encrypted_refresh_token, connected_at: new Date() }
  });
}

async function getRefreshToken() {
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { id: 1 } });
  return connection ? decrypt(connection.encrypted_refresh_token) : (process.env.GOOGLE_REFRESH_TOKEN || null);
}

module.exports = { saveRefreshToken, getRefreshToken };
