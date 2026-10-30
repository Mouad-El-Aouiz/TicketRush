import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/common/application.js';
import { Runtime } from '../src/runtime/runtime.module.js';
import { Notifications } from '../src/notifications/notifications.module.js';
import { Database } from '../src/database/database.module.js';
describe('Local operations on Redis and PostgreSQL', () => {
  let app: INestApplication<App>;
  let runtime: Runtime;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configure(module.createNestApplication<INestApplication<App>>());
    await app.init();
    runtime = app.get(Runtime);
  });
  afterAll(async () => {
    await app.close();
  });
  it('exposes readiness and Prometheus measurements', async () => {
    await request(app.getHttpServer()).get('/api/ops/ready').expect(200);
    const res = await request(app.getHttpServer())
      .get('/api/ops/metrics')
      .expect(200);
    expect(res.text).toContain('ticketrush_http_requests_total');
  });
  it('caches reads, invalidates and applies an atomic rate limit', async () => {
    const old = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      let calls = 0;
      const key = randomUUID();
      const load = () => Promise.resolve({ count: ++calls });
      expect(await runtime.cached(key, load)).toEqual({ count: 1 });
      expect(await runtime.cached(key, load)).toEqual({ count: 1 });
      await runtime.invalidate();
      expect(await runtime.cached(key, load)).toEqual({ count: 2 });
      await runtime.limit(key, 2);
      await runtime.limit(key, 2);
      await expect(runtime.limit(key, 2)).rejects.toThrow('Too many');
    } finally {
      process.env.NODE_ENV = old;
    }
  });
  it('maintains queue position and removes a departed member', async () => {
    const event = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    expect((await runtime.queue(event, first)).position).toBe(1);
    await new Promise((r) => setTimeout(r, 2));
    expect((await runtime.queue(event, second)).position).toBe(2);
    expect((await runtime.queue(event, first)).position).toBe(1);
    await runtime.leave(event, first);
    expect((await runtime.queue(event, second)).position).toBe(1);
  });
  it('records one stable notification outbox event when fulfillment is replayed', async () => {
    const previous = process.env.NODE_ENV;
    const orderId = randomUUID();
    const userId = randomUUID();
    const db = app.get(Database);
    process.env.NODE_ENV = 'development';
    try {
      const notifications = app.get(Notifications);
      await notifications.ready(orderId, userId, 2);
      const first = await db.outbox.findFirstOrThrow({
        where: { aggregateId: orderId, type: 'TICKETS_READY' },
      });
      await notifications.ready(orderId, userId, 2);
      const rows = await db.outbox.findMany({
        where: { aggregateId: orderId, type: 'TICKETS_READY' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toEqual(first.payload);
    } finally {
      process.env.NODE_ENV = previous;
      await db.outbox.deleteMany({
        where: { aggregateId: orderId, type: 'TICKETS_READY' },
      });
    }
  });
});
