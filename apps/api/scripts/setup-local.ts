import { config } from 'dotenv';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../../../.env', import.meta.url));
config({ path, quiet: true });
const existing = await readFile(path, 'utf8');
const host = process.env.POSTGRES_HOST ?? '127.0.0.1';
const port = process.env.POSTGRES_PORT ?? '5432';
const db = process.env.POSTGRES_DB ?? 'ticketrush';
const user = process.env.POSTGRES_USER ?? 'ticketrush';
const password = process.env.POSTGRES_PASSWORD;
if (!password) throw new Error('POSTGRES_PASSWORD is required');
const admin = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
const values: Record<string, string> = {};
if (!process.env.DATABASE_ADMIN_URL) values.DATABASE_ADMIN_URL = admin;
if (!process.env.JWT_SECRET)
  values.JWT_SECRET = randomBytes(48).toString('hex');
if (!process.env.PAYMENT_SECRET)
  values.PAYMENT_SECRET = randomBytes(48).toString('hex');
if (!process.env.WEBHOOK_ENCRYPTION_KEY)
  values.WEBHOOK_ENCRYPTION_KEY = randomBytes(32).toString('hex');
if (!process.env.GRAFANA_PASSWORD)
  values.GRAFANA_PASSWORD = randomBytes(24).toString('hex');
if (!process.env.DATABASE_URL) {
  const appPassword = randomBytes(32).toString('hex');
  const client = new Client({ connectionString: admin });
  await client.connect();
  try {
    const role = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ticketrush_app') AS exists",
    );
    if (role.rows[0]?.exists)
      throw new Error(
        'ticketrush_app already exists; configure DATABASE_URL explicitly rather than rotating its password',
      );
    const command = await client.query<{ sql: string }>(
      "SELECT format('CREATE ROLE ticketrush_app LOGIN PASSWORD %L', $1::text) AS sql",
      [appPassword],
    );
    await client.query(command.rows[0]!.sql);
    await client.query(
      `GRANT CONNECT ON DATABASE "${db.replaceAll('"', '""')}" TO ticketrush_app`,
    );
    await client.query('GRANT USAGE ON SCHEMA public TO ticketrush_app');
    await client.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ticketrush_app',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ticketrush_app',
    );
  } finally {
    await client.end();
  }
  values.DATABASE_URL = `postgresql://ticketrush_app:${appPassword}@${host}:${port}/${db}`;
}
const applicationUrl = new URL(process.env.DATABASE_URL || values.DATABASE_URL);
applicationUrl.hostname = 'postgres';
applicationUrl.port = '5432';
values.DATABASE_CONTAINER_URL = applicationUrl.toString();
const adminUrl = new URL(process.env.DATABASE_ADMIN_URL || admin);
adminUrl.hostname = 'postgres';
adminUrl.port = '5432';
values.DATABASE_ADMIN_CONTAINER_URL = adminUrl.toString();
if (!process.env.NOTIFICATIONS_SERVICE_KEY)
  values.NOTIFICATIONS_SERVICE_KEY = randomBytes(32).toString('hex');
if (!process.env.RABBITMQ_PASSWORD)
  throw new Error('Run scripts/init-env.mjs to initialize RabbitMQ');
if (!process.env.NOTIFICATIONS_BROKER_URL)
  values.NOTIFICATIONS_BROKER_URL = `amqp://${encodeURIComponent(process.env.RABBITMQ_USER ?? 'ticketrush')}:${encodeURIComponent(process.env.RABBITMQ_PASSWORD)}@127.0.0.1:5672`;
if (!process.env.NOTIFICATIONS_URL)
  values.NOTIFICATIONS_URL = 'http://127.0.0.1:4100';
const brokerUrl = new URL(
  process.env.NOTIFICATIONS_BROKER_URL || values.NOTIFICATIONS_BROKER_URL,
);
brokerUrl.hostname = 'rabbitmq';
brokerUrl.port = '5672';
values.NOTIFICATIONS_BROKER_CONTAINER_URL = brokerUrl.toString();
let updated = existing;
for (const [key, value] of Object.entries(values)) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  updated = line.test(updated)
    ? updated.replace(line, `${key}=${value}`)
    : `${updated}\n${key}=${value}\n`;
}
await writeFile(path, updated);
console.log(
  'Local application configuration prepared. Secrets were not displayed.',
);
