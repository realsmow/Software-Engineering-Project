import type { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { mailSettings } from '../../src/common/mail/mailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));

// Keep the scenario independent of developer/CI SMTP environment variables.
const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('FR-AUTH-04/07 / NFR-SEC-01: outbound account mail configuration', () => {
  beforeEach(() => jest.clearAllMocks());
  // A stuck relay must not hang the request that sends the mail.
  const FAIL_FAST = {
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
  it('uses the local mail sink without SMTP login when credentials are absent', () => {
    const result = mailSettings(config({}));
    expect(createTransport).toHaveBeenCalledWith({
      ...FAIL_FAST,
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
    expect(result).toMatchObject({
      from: 'ULMs <no-reply@ku.th>',
      appUrl: 'http://localhost:5173',
    });
  });
  it('uses the configured secure authenticated relay and normalizes the public URL', () => {
    const result = mailSettings(
      config({
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'qa-mail-user',
        SMTP_PASS: 'qa-mail-password',
        MAIL_FROM: 'QA <qa@ku.th>',
        PUBLIC_APP_URL: 'https://qa.example.test///',
      }),
    );
    expect(createTransport).toHaveBeenCalledWith({
      ...FAIL_FAST,
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: { user: 'qa-mail-user', pass: 'qa-mail-password' },
    });
    expect(result).toMatchObject({
      from: 'QA <qa@ku.th>',
      appUrl: 'https://qa.example.test',
    });
  });
  it('does not force implicit TLS or SMTP authentication just because a password is present', () => {
    mailSettings(
      config({
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_PASS: 'unused-without-user',
      }),
    );
    expect(createTransport).toHaveBeenCalledWith({
      ...FAIL_FAST,
      host: 'localhost',
      port: 587,
      secure: false,
      auth: undefined,
    });
  });
});
