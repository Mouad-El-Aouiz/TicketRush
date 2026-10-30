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
