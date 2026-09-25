import { createTransport, type Transporter } from 'nodemailer';
import type { ConfigService } from '@nestjs/config';

/**
 * The outbound mail settings, read once per service that sends mail.
 *
 * A plain function rather than an injectable so the services that send mail
 * keep constructors that take only ConfigService, which is what their unit
 * tests construct them with.
 *
 * ponytail: no pooling, no retry queue. Every mail this app sends is one short
 * message on a human action. Defaults point at the MailHog container in
 * docker-compose.
 */
export function mailSettings(config: ConfigService): {
  mailer: Transporter;
  from: string;
  appUrl: string;
} {
  return {
    mailer: createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(config.get<string>('SMTP_PORT') ?? 1025),
      // true for port 465; 587 upgrades with STARTTLS on its own.
      secure: config.get<string>('SMTP_SECURE') === 'true',
      // MailHog needs no login; a real relay does.
      auth: config.get<string>('SMTP_USER')
        ? {
            user: config.get<string>('SMTP_USER'),
            pass: config.get<string>('SMTP_PASS'),
          }
        : undefined,
    }),
    from: config.get<string>('MAIL_FROM') ?? 'ULMs <no-reply@ku.th>',
    appUrl: (
      config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173'
    ).replace(/\/+$/, ''),
  };
}
