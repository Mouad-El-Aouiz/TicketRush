import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/common/application.js';
import { Database } from '../src/database/database.module.js';

describe('Platform authorization and validation', () => {
  let app: INestApplication<App>;
  let db: Database;
  const password = 'Test-password-for-integration-42';
  let clientToken: string;
  let organizerToken: string;
  let secondToken: string;
  let organizerId: string;
  let eventId: string;

  async function account(role = 'CLIENT') {
    const email = `test-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    const user = await db.user.update({ where: { email }, data: { role } });
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    return {
      id: user.id,
      token: z.object({ accessToken: z.string() }).parse(response.body)
        .accessToken,
      email,
      cookie: response.headers['set-cookie'],
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configure(module.createNestApplication<INestApplication<App>>());
    await app.init();
    db = app.get(Database);
    clientToken = (await account()).token;
    const organizer = await account('ORGANISATEUR');
    organizerToken = organizer.token;
    organizerId = organizer.id;
    secondToken = (await account('ORGANISATEUR')).token;
  });
  afterAll(async () => {
    if (eventId)
      await db.event.update({
        where: { id: eventId },
        data: { status: 'WITHDRAWN' },
      });
    await app.close();
  });

  it('rejects role escalation and returns a correlated validation error', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'invalid', password: 'short', role: 'ADMIN' })
      .expect(400);
    expect(result.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(result.headers['x-correlation-id']).toBeTruthy();
  });
  it('keeps Google sign-in disabled when local OAuth credentials are absent', async () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    try {
      await request(app.getHttpServer())
        .get('/api/auth/google/status')
        .expect(200, { enabled: false });
    } finally {
      if (clientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
      else process.env.GOOGLE_CLIENT_ID = clientId;
      if (clientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
      else process.env.GOOGLE_CLIENT_SECRET = clientSecret;
    }
  });
  it('reports the documentation assistant disabled without local Ollama', async () => {
    const ollamaUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = '';
    try {
      await request(app.getHttpServer())
        .get('/api/assistant/status')
        .expect(200, { enabled: false });
      await request(app.getHttpServer())
        .post('/api/assistant/ask')
        .send({ question: 'Where are my tickets?' })
        .expect(503);
    } finally {
      if (ollamaUrl === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = ollamaUrl;
    }
  });
  it('requires authentication and the organizer role', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/events')
      .auth(clientToken, { type: 'bearer' })
      .send({})
      .expect(403);
  });
  it('keeps drafts private, prevents cross-owner changes and publishes valid categories', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/events')
      .auth(organizerToken, { type: 'bearer' })
      .send({
        title: 'Integration concert',
        description: 'An integration event for concurrent booking.',
        venue: 'Test hall',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    eventId = z.object({ id: z.string() }).parse(created.body).id;
    await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}`)
      .auth(secondToken, { type: 'bearer' })
      .send({ title: 'Stolen event' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/publish`)
      .auth(organizerToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/categories`)
      .auth(organizerToken, { type: 'bearer' })
      .send({ name: 'Standard', priceCents: 2500, capacity: 10 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/events/${eventId}/publish`)
      .auth(organizerToken, { type: 'bearer' })
      .expect(201);
    const detail = await request(app.getHttpServer())
      .get(`/api/events/${eventId}`)
      .expect(200);
    expect(detail.body).toMatchObject({ organizerId, status: 'PUBLISHED' });
    await request(app.getHttpServer())
      .patch(`/api/events/${eventId}`)
      .auth(organizerToken, { type: 'bearer' })
      .send({ title: 'Changed after sale' })
      .expect(400);
  });
  it('rotates a refresh cookie once and rejects its replay and foreign origins', async () => {
    const user = await account();
    const cookies = z.array(z.string()).parse(user.cookie);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookies)
      .set('Origin', 'https://attacker.example')
      .expect(403);
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookies)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(user.token, { type: 'bearer' })
      .expect(401);
    const newCookies = z
      .array(z.string())
      .parse(refreshed.headers['set-cookie']);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', newCookies)
      .expect(201);
    const token = z
      .object({ accessToken: z.string() })
      .parse(refreshed.body).accessToken;
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });
});
