/** Mirrors technicalConfigOutput in backend/src/admin/admin.schema.ts. */
export interface TechnicalConfig {
  auth: {
    googleOauthEnabled: boolean;
    localFallbackEnabled: boolean;
    allowedEmailDomains: string[];
    sessionTimeoutMinutes: number;
  };
  storage: {
    provider: string;
    bucket: string;
    maxUploadMb: number;
    presignedUploads: boolean;
  };
  email: { smtpHost: string; fromAddress: string; dueReminderEnabled: boolean };
  polling: {
    availabilitySeconds: number;
    facilitySlotsSeconds: number;
    requestStatusSeconds: number;
    notificationsSeconds: number;
    staffQueueSeconds: number;
    supervisorQueueSeconds: number;
  };
  security: {
    cookieSecure: boolean;
    cookieSameSite: string;
    allowedOrigins: string[];
    nodeEnv: string;
  };
}
