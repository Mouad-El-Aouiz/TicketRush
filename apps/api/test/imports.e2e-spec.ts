import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configure } from '../src/common/application.js';
import { Database } from '../src/database/database.module.js';
import { AuthService } from '../src/auth/auth.module.js';
describe('Streaming CSV imports', () => {
  let app: INestApplication<App>,
    db: Database,
    token: string,
    client: string,
    userId: string;
  const title = `CSV fixture ${randomUUID()}`;
  const header =
    'title,description,venue,startsAt,category,capacity,priceCents\n';
  const line = (name: string, capacity = 10) =>
    `${name},Long enough description,Local venue,2030-11-15T18:00:00.000Z,Standard,${capacity},2500\n`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configure(module.createNestApplication<INestApplication<App>>());
    await app.init();
    db = app.get(Database);
    const user = await db.user.create({
      data: {
        email: `csv-${randomUUID()}@example.com`,
        passwordHash: 'unused-test-hash',
        role: 'ORGANISATEUR',
      },
    });
    userId = user.id;
    token = (await app.get(AuthService).issue(user.id)).accessToken;
    const buyer = await db.user.create({
      data: {
        email: `csv-${randomUUID()}@example.com`,
        passwordHash: 'unused-test-hash',
      },
    });
    client = (await app.get(AuthService).issue(buyer.id)).accessToken;
  });
  afterAll(async () => {
    if (userId) {
      await db.category.deleteMany({
        where: { event: { organizerId: userId } },
      });
      await db.event.deleteMany({ where: { organizerId: userId } });
    }
    await app.close();
  });
  it('restricts uploads to organizers and requires CSV media type', async () => {
    await request(app.getHttpServer())
      .post('/api/imports/events')
      .set('Authorization', `Bearer ${client}`)
      .type('text/csv')
      .send(header)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/imports/events')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });
  it('preserves ownership, drafts and row-level error reporting', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/imports/events')
      .set('Authorization', `Bearer ${token}`)
      .type('text/csv')
      .send(header + line(title) + line(title + ' invalid', -1))
      .expect(201);
    expect(response.body).toMatchObject({
      rows: 2,
      imported: 1,
      rejected: 1,
      errors: [{ line: 3 }],
    });
    const event = await db.event.findFirstOrThrow({
      where: { organizerId: userId, title },
      include: { categories: true },
    });
    expect(event.status).toBe('DRAFT');
    expect(event.categories[0].priceCents).toBe(2500);
    await request(app.getHttpServer())
      .get(`/api/events/${event.id}`)
      .expect(404);
  });
  it('imports across transaction batches and reports malformed input', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/imports/events')
      .set('Authorization', `Bearer ${token}`)
      .type('text/csv')
      .send(
        header +
          Array.from({ length: 401 }, (_, i) =>
            line(`${title} batch ${i}`),
          ).join(''),
      )
      .expect(201);
    expect(response.body).toMatchObject({ imported: 401, rejected: 0 });
    expect(await db.event.count({ where: { organizerId: userId } })).toBe(402);
    const invalid = await request(app.getHttpServer())
      .post('/api/imports/events')
      .set('Authorization', `Bearer ${token}`)
      .type('text/csv')
      .send(header + '"unterminated')
      .expect(400);
    expect(invalid.body).toMatchObject({
      code: 'CSV_INCOMPLETE',
      details: { imported: 0 },
    });
  });
});
