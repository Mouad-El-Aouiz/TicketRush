import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({
  path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
  quiet: true,
});

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(48),
    PAYMENT_SECRET: z.string().min(48),
    WEBHOOK_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
    WEB_ORIGIN: z.url().default('http://127.0.0.1:3001'),
    GOOGLE_CLIENT_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    GOOGLE_CLIENT_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    GOOGLE_REDIRECT_URI: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    OLLAMA_BASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .url()
        .refine(
          (value) => ['http:', 'https:'].includes(new URL(value).protocol),
          'Ollama must use HTTP or HTTPS',
        )
        .refine((value) => {
          const hostname = new URL(value).hostname;
          return [
            'localhost',
            '127.0.0.1',
            '[::1]',
            '::1',
            'host.docker.internal',
            'ollama',
          ].includes(hostname);
        }, 'Ollama must use a local host')
        .optional(),
    ),
    OLLAMA_CHAT_MODEL: z.string().min(1).default('qwen3:4b'),
    OLLAMA_EMBEDDING_MODEL: z.string().min(1).default('embeddinggemma'),
    API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
    PAYMENT_PROVIDER_URL: z.url().default('http://127.0.0.1:4000'),
    REDIS_PASSWORD: z.string().min(1),
    REDIS_HOST: z.string().default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    NOTIFICATIONS_BROKER_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.url().optional(),
    ),
    NOTIFICATIONS_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.url().optional(),
    ),
    NOTIFICATIONS_SERVICE_KEY: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().min(48).optional(),
    ),
  })
  .superRefine((env, ctx) => {
    const googleFields = [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    ].filter(Boolean).length;
    if (googleFields !== 0 && googleFields !== 2)
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'Configure both Google OAuth credentials together',
      });
    const fields = [
      'NOTIFICATIONS_BROKER_URL',
      'NOTIFICATIONS_URL',
      'NOTIFICATIONS_SERVICE_KEY',
    ] as const;
    const configured = fields.filter((key) => env[key] !== undefined).length;
    if (configured !== 0 && configured !== fields.length)
      ctx.addIssue({
        code: 'custom',
        path: ['NOTIFICATIONS_URL'],
        message: 'Configure all notification integration fields together',
      });
  });

export function environment() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}
