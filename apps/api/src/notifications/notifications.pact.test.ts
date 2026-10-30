import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { expect, it, vi } from 'vitest';
import { Database } from '../database/database.module.js';
import { requestContext } from '../common/context.js';
import { Notifications } from './notifications.module.js';

vi.mock('../config/environment.js', () => ({
  environment: () => ({
    NODE_ENV: process.env.NODE_ENV,
    NOTIFICATIONS_BROKER_URL: 'amqp://contract-test.invalid',
    NOTIFICATIONS_URL: process.env.NOTIFICATIONS_URL,
    NOTIFICATIONS_SERVICE_KEY: process.env.NOTIFICATIONS_SERVICE_KEY,
  }),
}));

const userId = '13131313-1313-4131-a131-131313131313';
const orderId = '24242424-2424-4242-a242-242424242424';
const eventId = '35353535-3535-4353-a353-353535353535';
const correlationId = '46464646-4646-4464-a464-464646464646';
const serviceKey = 'pact-contract-test-service-key-not-a-secret';
const pactsDirectory = fileURLToPath(
  new URL('../../../../pacts/', import.meta.url),
);

it('records and exercises the API notifications inbox contract', async () => {
  await mkdir(pactsDirectory, { recursive: true });
  const pact = new PactV4({
    consumer: 'TicketRush API',
    provider: 'TicketRush Notifications',
    dir: pactsDirectory,
  });
  const responseTime = MatchersV3.datetime(
    "yyyy-MM-dd'T'HH:mm:ss.SSSX",
    '2026-10-30T12:00:00.000Z',
  );
  const interaction = pact
    .addInteraction()
    .given('a user has a ready-ticket notification', {
      eventId,
      orderId,
      userId,
    })
    .uponReceiving('a request for the authenticated user notification inbox')
    .withRequest('GET', `/internal/users/${userId}/notifications`, (request) =>
      request.headers({
        'x-service-key': serviceKey,
        'x-correlation-id': correlationId,
      }),
    )
    .willRespondWith(200, (response) =>
      response.jsonBody([
        {
          id: eventId,
          orderId,
          userId,
          message:
            'Your 1 ticket(s) are ready. Download them from your orders.',
          createdAt: responseTime,
        },
      ]),
    );

  await interaction.executeTest(async (mockServer) => {
    const priorEnvironment = {
      NODE_ENV: process.env.NODE_ENV,
      NOTIFICATIONS_URL: process.env.NOTIFICATIONS_URL,
      NOTIFICATIONS_SERVICE_KEY: process.env.NOTIFICATIONS_SERVICE_KEY,
    };
    process.env.NODE_ENV = 'development';
    process.env.NOTIFICATIONS_URL = mockServer.url;
    process.env.NOTIFICATIONS_SERVICE_KEY = serviceKey;
    try {
      const db = {
        notification: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as Database;
      const service = new Notifications(db);
      const result = await requestContext.run({ correlationId }, () =>
        service.list(userId),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: eventId,
        orderId,
        userId,
        message: 'Your 1 ticket(s) are ready. Download them from your orders.',
      });
      return result;
    } finally {
      for (const [key, value] of Object.entries(priorEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
