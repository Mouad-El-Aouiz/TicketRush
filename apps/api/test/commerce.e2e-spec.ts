import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import request from 'supertest';
import { randomUUID, createHmac } from 'node:crypto';
import { hash } from 'argon2';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/common/application.js';
import { Database } from '../src/database/database.module.js';
import { ReservationsService } from '../src/reservations/reservations.module.js';
import { OrdersService } from '../src/orders/orders.module.js';
import { TicketsService } from '../src/tickets/tickets.module.js';
import { AuthService } from '../src/auth/auth.module.js';
import { environment } from '../src/config/environment.js';
import { Queue } from 'bullmq';
import { DeliveryService } from '../src/delivery/delivery.module.js';

describe('Commerce invariants on real PostgreSQL', () => {
  let app: INestApplication<App>;
  let db: Database;
  let holds: ReservationsService;
  let orders: OrdersService;
  let tickets: TicketsService;
  let userId: string;
  let otherId: string;
  let controllerId: string;
  let token: string;
  let otherToken: string;
  let eventId: string;
  let categoryId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configure(
      module.createNestApplication<INestApplication<App>>({ rawBody: true }),
    );
    await app.init();
    db = app.get(Database);
    holds = app.get(ReservationsService);
    orders = app.get(OrdersService);
    tickets = app.get(TicketsService);
    const passwordHash = await hash('Integration-password-42');
    const organizer = await db.user.create({
      data: {
        email: `organizer-${randomUUID()}@example.com`,
        passwordHash,
        role: 'ORGANISATEUR',
      },
    });
    userId = (
      await db.user.create({
        data: { email: `buyer-${randomUUID()}@example.com`, passwordHash },
      })
    ).id;
    otherId = (
      await db.user.create({
        data: { email: `buyer-${randomUUID()}@example.com`, passwordHash },
      })
    ).id;
    controllerId = (
      await db.user.create({
        data: {
          email: `controller-${randomUUID()}@example.com`,
          passwordHash,
          role: 'CONTROLEUR',
        },
      })
    ).id;
    token = (await app.get(AuthService).issue(userId)).accessToken;
    otherToken = (await app.get(AuthService).issue(otherId)).accessToken;
    const event = await db.event.create({
      data: {
        organizerId: organizer.id,
        title: 'Concurrency fixture',
        description: 'Integration event',
        venue: 'Test venue',
        startsAt: new Date(Date.now() + 86400000),
        status: 'PUBLISHED',
        categories: {
          create: { name: 'Standard', capacity: 10, priceCents: 2500 },
        },
      },
      include: { categories: true },
    });
    eventId = event.id;
    categoryId = event.categories[0].id;
    await db.assignment.create({ data: { eventId, userId: controllerId } });
  });
  afterAll(async () => {
    await app.close();
  });

  it('proves naive overselling, then rejects excess requests among 500 concurrent reservations', async () => {
    const naive = await db.category.create({
      data: {
        eventId,
        name: 'Naive isolated fixture',
        capacity: 10,
        priceCents: 100,
      },
    });
    let reached = 0;
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    await Promise.all(
      Array.from({ length: 50 }, async () => {
        const before = await db.hold.aggregate({
          where: { categoryId: naive.id },
          _sum: { quantity: true },
        });
        reached++;
        if (reached === 50) release();
        await barrier;
        if ((before._sum.quantity ?? 0) < 10)
          await db.hold.create({
            data: {
              userId,
              categoryId: naive.id,
              quantity: 1,
              unitPriceCents: 100,
              expiresAt: new Date(Date.now() + 600000),
            },
          });
      }),
    );
    expect(await db.hold.count({ where: { categoryId: naive.id } })).toBe(50);
    await db.hold.deleteMany({ where: { categoryId: naive.id } });
    const started = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: 500 }, () =>
        holds.reserve(userId, { categoryId, quantity: 1 }),
      ),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled').length;
    console.log(
      JSON.stringify({
        scenario: 'locked-reservations',
        requests: 500,
        accepted,
        rejected: 500 - accepted,
        durationMs: Math.round(performance.now() - started),
        oversold: Math.max(0, accepted - 10),
      }),
    );
    expect(accepted).toBe(10);
    expect(
      await db.hold.count({ where: { categoryId, status: 'ACTIVE' } }),
    ).toBe(10);
  });
  it('expires holds and restores availability without double release', async () => {
    await db.hold.updateMany({
      where: { categoryId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await holds.expire()).toBeGreaterThanOrEqual(10);
    await holds.expire();
    expect((await holds.availability(categoryId)).available).toBe(10);
  });
  it('creates one order, rejects key reuse and enforces object ownership', async () => {
    const hold = await holds.reserve(userId, { categoryId, quantity: 2 });
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => orders.create(userId, hold.id, key)),
    );
    expect(new Set(results.map((o) => o.id)).size).toBe(1);
    const other = await holds.reserve(userId, { categoryId, quantity: 1 });
    await expect(orders.create(userId, other.id, key)).rejects.toThrow(
      'different payload',
    );
    await request(app.getHttpServer())
      .get(`/api/orders/${results[0].id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await expect(orders.create(otherId, hold.id, randomUUID())).rejects.toThrow(
      'not found',
    );
  });
  it('verifies HMAC, handles replay and produces exactly one ticket per purchased place', async () => {
    const hold = await holds.reserve(userId, { categoryId, quantity: 2 });
    const order = await orders.create(userId, hold.id, randomUUID());
    const payment = await orders.initiate(order.id, userId);
    const payload = {
      id: randomUUID(),
      orderId: order.id,
      providerRef: payment.providerRef,
      amountCents: payment.amountCents,
      status: 'SUCCEEDED',
      timestamp: Date.now(),
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', environment().PAYMENT_SECRET)
      .update(raw)
      .digest('hex');
    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .send(payload)
      .set('x-payment-signature', '0'.repeat(64))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/payments/webhook')
      .send(payload)
      .set('x-payment-signature', signature)
      .expect(201);
    await Promise.all(
      Array.from({ length: 5 }, () => orders.receive(raw, signature)),
    );
    expect(await db.outbox.count({ where: { aggregateId: order.id } })).toBe(1);
    await tickets.fulfill(order.id);
    await tickets.fulfill(order.id);
    const issued = await db.ticket.findMany({ where: { orderId: order.id } });
    expect(issued).toHaveLength(2);
    expect(issued.every((t) => t.pdfReady)).toBe(true);
    const pdf = await request(app.getHttpServer())
      .get(`/api/tickets/${issued[0].id}/pdf`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    await request(app.getHttpServer())
      .get(`/api/tickets/${issued[0].id}/pdf`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    const scans = await Promise.allSettled([
      tickets.scan(eventId, issued[0].code, controllerId),
      tickets.scan(eventId, issued[0].code, controllerId),
    ]);
    expect(scans.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    await expect(
      tickets.scan(eventId, issued[1].code, otherId),
    ).rejects.toThrow('assignment');
  });
  it('records a late successful payment as refunded and issues no tickets', async () => {
    const hold = await holds.reserve(userId, { categoryId, quantity: 1 });
    const order = await orders.create(userId, hold.id, randomUUID());
    const payment = await orders.initiate(order.id, userId);
    await db.hold.update({
      where: { id: hold.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const raw = Buffer.from(
      JSON.stringify({
        id: randomUUID(),
        orderId: order.id,
        providerRef: payment.providerRef,
        amountCents: payment.amountCents,
        status: 'SUCCEEDED',
        timestamp: Date.now(),
      }),
    );
    await orders.receive(
      raw,
      createHmac('sha256', environment().PAYMENT_SECRET)
        .update(raw)
        .digest('hex'),
    );
    expect(
      (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
        .status,
    ).toBe('REFUNDED');
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(0);
  });
  it('demonstrates a PostgreSQL deadlock in an isolated fixture', async () => {
    const second = await db.category.create({
      data: { eventId, name: 'Deadlock fixture', capacity: 1, priceCents: 1 },
    });
    let reached = 0;
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lock = async (first: string, last: string) =>
      db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM categories WHERE id=${first}::uuid FOR UPDATE`;
          reached++;
          if (reached === 2) release();
          await barrier;
          await tx.$queryRaw`SELECT id FROM categories WHERE id=${last}::uuid FOR UPDATE`;
        },
        { timeout: 10000 },
      );
    const results = await Promise.allSettled([
      lock(categoryId, second.id),
      lock(second.id, categoryId),
    ]);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    // Production paths lock event then category in the same order, avoiding this inverse acquisition.
  });
  it('dispatches real outbox jobs and dead-letters an exhausted failure', async () => {
    const delivery = app.get(DeliveryService);
    const env = environment();
    const connection = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    };
    const queue = new Queue('ticketrush-delivery', { connection });
    const dead = new Queue('ticketrush-dead-letter', { connection });
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      delivery.onModuleInit();
    } finally {
      process.env.NODE_ENV = original;
    }
    try {
      const job = await queue.add(
        'tickets',
        { orderId: randomUUID() },
        {
          jobId: randomUUID(),
          attempts: 2,
          backoff: { type: 'fixed', delay: 10 },
        },
      );
      const end = Date.now() + 15000;
      while (Date.now() < end && !(await dead.getJob(job.id!)))
        await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await job.getState()).toBe('failed');
      expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2);
      expect(await dead.getJob(job.id!)).toBeTruthy();
      await delivery.dispatch();
      expect(await db.outbox.count({ where: { publishedAt: null } })).toBe(0);
      await (await dead.getJob(job.id!))?.remove();
      await job.remove();
    } finally {
      await queue.close();
      await dead.close();
    }
  });
});
