jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));
jest.mock('../utils/resend', () => ({ sendEmailResend: jest.fn() }));
const nodemailer = require('nodemailer');
const { sendEmailResend } = require('../utils/resend');
const { sendBookingNotification } = require('../utils/email');
const sendSMTP = nodemailer.createTransport.mock.results[0].value.sendMail;
const originalEnv = { ...process.env };
const booking = { navn: 'Test', email: 'customer@example.com', bookingId: 'TEST', created_at: new Date() };

afterAll(() => { process.env = originalEnv; });
beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, FROM_EMAIL: 'clinic@example.com', NOTIFICATION_EMAIL: 'first@example.com', NOTIFICATION_EMAIL_2: 'second@example.com' };
    sendSMTP.mockReset().mockResolvedValue({ messageId: 'smtp-test' });
    sendEmailResend.mockReset().mockResolvedValue({ id: 'resend-test' });
});
describe.each(['Resend', 'SMTP'])('%s notifications', provider => {
    function sender() {
        if (provider === 'Resend') process.env.RESEND_API_KEY = 'test-key';
        else delete process.env.RESEND_API_KEY;
        return provider === 'Resend' ? sendEmailResend : sendSMTP;
    }
    test('Sends separately to both recipients', async () => {
        const send = sender();
        await sendBookingNotification(booking);
        expect(send.mock.calls.map(([mail]) => mail.to)).toEqual(['first@example.com', 'second@example.com']);
    });
    test('Attempts second recipient even if first fails', async () => {
        const send = sender();
        send.mockRejectedValueOnce(new Error('First recipient failed'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await expect(sendBookingNotification(booking)).rejects.toThrow('1 af 2');
            expect(send).toHaveBeenCalledTimes(2);
            expect(send.mock.calls[1][0].to).toBe('second@example.com');
        } finally { log.mockRestore(); }
    });
    test('Reports second-recipient failure after attempting both', async () => {
        const send = sender();
        send.mockResolvedValueOnce({ id: 'ok' }).mockRejectedValueOnce(new Error('Second failed'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await expect(sendBookingNotification(booking)).rejects.toThrow('1 af 2');
            expect(send).toHaveBeenCalledTimes(2);
        } finally { log.mockRestore(); }
    });
    test('Empty second address preserves one recipient', async () => {
        const send = sender();
        process.env.NOTIFICATION_EMAIL_2 = '';
        await sendBookingNotification(booking);
        expect(send).toHaveBeenCalledTimes(1);
    });
    test('Trims and deduplicates identical addresses', async () => {
        const send = sender();
        process.env.NOTIFICATION_EMAIL_2 = ' first@example.com ';
        await sendBookingNotification(booking);
        expect(send).toHaveBeenCalledTimes(1);
    });
    test('Falls back to FROM_EMAIL for the primary recipient', async () => {
        const send = sender();
        delete process.env.NOTIFICATION_EMAIL;
        await sendBookingNotification(booking);
        expect(send.mock.calls[0][0].to).toBe('clinic@example.com');
    });
});
