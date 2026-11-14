import { z } from 'zod';

/**
 * Environment configuration, parsed once at module load.
 *
 * Every variable has a local-development default so `npm run dev` works with no
 * `.env.local` at all. Production is stricter: the checks in `assertProduction`
 * run at startup and fail loudly rather than silently falling back.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  WORK_FILE_STORAGE: z.enum(['database', 'vercel-blob']).default('database'),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default(
      'pilani.bits-pilani.ac.in,goa.bits-pilani.ac.in,hyderabad.bits-pilani.ac.in,dubai.bits-pilani.ac.in,bits-pilani.ac.in',
    )
    .transform((value) =>
      value
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${parsed.error.message}`);
}

const raw = parsed.data;

const isProduction = raw.NODE_ENV === 'production';

/** Only ever used locally; production refuses to start without a real secret. */
const DEV_SESSION_SECRET = 'kriti-development-secret-not-for-production-use';

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isDevelopment: raw.NODE_ENV === 'development',

  sessionSecret: raw.SESSION_SECRET ?? DEV_SESSION_SECRET,

  /** Unset means PGlite: an embedded Postgres in ./local-db, no Docker required. */
  databaseUrl: raw.DATABASE_URL,

  googleClientId: raw.GOOGLE_CLIENT_ID,
  googleClientSecret: raw.GOOGLE_CLIENT_SECRET,
  workFileStorage: raw.WORK_FILE_STORAGE,
  allowedEmailDomains: raw.ALLOWED_EMAIL_DOMAINS,
} as const;

/** Google sign-in is offered only when both halves of the credential exist. */
export const isGoogleAuthConfigured = Boolean(env.googleClientId && env.googleClientSecret);

export function assertProductionConfig(): void {
  if (!isProduction) return;

  const missing: string[] = [];
  if (!raw.SESSION_SECRET || raw.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
  if (!raw.DATABASE_URL) missing.push('DATABASE_URL');
  if (!isGoogleAuthConfigured) missing.push('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
  if (process.env.VERCEL && raw.WORK_FILE_STORAGE !== 'vercel-blob')
    missing.push('WORK_FILE_STORAGE=vercel-blob');
  // The client-token upload API requires a read/write token even though the
  // SDK's ordinary get/put methods also support OIDC credentials.
  if (raw.WORK_FILE_STORAGE === 'vercel-blob' && !process.env.BLOB_READ_WRITE_TOKEN)
    missing.push('BLOB_READ_WRITE_TOKEN');
  if (process.env.VERCEL && (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32))
    missing.push('CRON_SECRET (at least 32 characters)');

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
}
