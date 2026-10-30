import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type Actor, Roles } from '../auth/auth.module.js';
import { BodySchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import { resolveWebhookTarget } from './webhook-target.js';

const createSchema = z.object({ url: z.url() }).strict();
const deliverySchema = z
  .object({
    eventId: z.uuid(),
    endpointId: z.uuid(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

function encryptionKey() {
  return Buffer.from(environment().WEBHOOK_ENCRYPTION_KEY, 'hex');
}

export function encryptWebhookSecret(secret: string, key = encryptionKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('hex'))
    .join('.');
}

export function decryptWebhookSecret(value: string, key = encryptionKey()) {
  const [nonce, tag, ciphertext] = value
    .split('.')
    .map((part) => Buffer.from(part, 'hex'));
  if (!nonce || !tag || !ciphertext || nonce.length !== 12 || tag.length !== 16)
    throw new Error('Invalid encrypted webhook secret');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

function sendHttps(
  url: URL,
  address: string,
  family: 4 | 6,
  body: Buffer,
  eventId: string,
  secret: string,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
  const pinnedLookup = ((...args: unknown[]) => {
    const [, options, callback] = args as [
      string,
      number | { all?: boolean },
      (...values: unknown[]) => void,
    ];
    if (typeof options === 'object' && options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  }) as NonNullable<RequestOptions['lookup']>;

  return new Promise<void>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': body.byteLength,
          'x-ticketrush-event': 'order.paid',
          'x-ticketrush-event-id': eventId,
          'x-ticketrush-timestamp': timestamp,
          'x-ticketrush-signature': `sha256=${signature}`,
        },
        lookup: pinnedLookup,
        signal: AbortSignal.timeout(5000),
      },
      (response) => {
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > 8192)
            request.destroy(new Error('Webhook response too large'));
        });
        response.on('end', () => {
          if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          )
            resolve();
          else
            reject(
              new Error(`Webhook returned HTTP ${response.statusCode ?? 0}`),
            );
        });
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

@Injectable()
export class WebhooksService {
  constructor(private readonly db: Database) {}

  async list(organizerId: string) {
    return this.db.webhookEndpoint.findMany({
      where: { organizerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, active: true, createdAt: true },
    });
  }

  async create(organizerId: string, input: z.infer<typeof createSchema>) {
    let url: URL;
    try {
      url = await resolveWebhookTarget(input.url).then((target) => target.url);
    } catch {
      throw new BadRequestException(
        'Webhook URL must resolve only to public HTTPS addresses',
      );
    }
    const secret = randomBytes(32).toString('base64url');
    const endpoint = await this.db.webhookEndpoint.create({
      data: {
        organizerId,
        url: url.toString(),
        secretCiphertext: encryptWebhookSecret(secret),
      },
      select: { id: true, url: true, active: true, createdAt: true },
    });
    return { ...endpoint, secret };
  }

  async rotate(organizerId: string, id: string) {
    const endpoint = await this.db.webhookEndpoint.findFirst({
      where: { id, organizerId },
      select: { id: true, url: true, active: true, createdAt: true },
    });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    const secret = randomBytes(32).toString('base64url');
    await this.db.webhookEndpoint.update({
      where: { id },
      data: { secretCiphertext: encryptWebhookSecret(secret) },
    });
    return { ...endpoint, secret };
  }

  async remove(organizerId: string, id: string) {
    const result = await this.db.webhookEndpoint.deleteMany({
      where: { id, organizerId },
    });
    if (!result.count)
      throw new NotFoundException('Webhook endpoint not found');
    return { deleted: true };
  }

  async deliver(input: unknown) {
    const { eventId, endpointId, payload } = deliverySchema.parse(input);
    const endpoint = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, active: true },
    });
    if (!endpoint) return { skipped: true };
    const target = await resolveWebhookTarget(endpoint.url);
    const secret = decryptWebhookSecret(endpoint.secretCiphertext);
    const body = Buffer.from(JSON.stringify(payload));
    if (body.byteLength > 32_768)
      throw new Error('Webhook request body is too large');
    await sendHttps(
      target.url,
      target.address,
      target.family,
      body,
      eventId,
      secret,
    );
    return { delivered: true };
  }
}

@ApiTags('Organizer webhooks')
@ApiBearerAuth()
@Roles('ORGANISATEUR')
@Controller('organizer/webhooks')
class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentUser() actor: Actor) {
    return this.webhooks.list(actor.id);
  }

  @Post()
  create(
    @CurrentUser() actor: Actor,
    @Body(new BodySchema(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.webhooks.create(actor.id, body);
  }

  @Post(':id/rotate-secret')
  rotate(@CurrentUser() actor: Actor, @Param('id', uuid) id: string) {
    return this.webhooks.rotate(actor.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: Actor, @Param('id', uuid) id: string) {
    return this.webhooks.remove(actor.id, id);
  }
}

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

export function verifyWebhookSignature(
  body: Buffer,
  timestamp: string,
  signatureHeader: string,
  secret: string,
) {
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp) * 1000) > 300_000 ||
    !/^sha256=[a-f0-9]{64}$/.test(signatureHeader)
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest();
  const actual = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
