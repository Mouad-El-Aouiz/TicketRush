import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({
  path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
  quiet: true,
});

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(48),
  PAYMENT_SECRET: z.string().min(48),
  WEB_ORIGIN: z.url().default('http://localhost:3001'),
  PAYMENT_PROVIDER_URL: z.url().default('http://127.0.0.1:4000'),
  REDIS_PASSWORD: z.string().min(1),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
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
