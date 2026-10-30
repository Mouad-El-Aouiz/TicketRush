import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import {
  encryptWebhookSecret,
  verifyWebhookSignature,
  WebhooksService,
} from './webhooks.module.js';

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: mocked.request }));

describe('outgoing webhook delivery', () => {
  const key = Buffer.from(environment().WEBHOOK_ENCRYPTION_KEY, 'hex');
  const secret = randomBytes(32).toString('base64url');
  const eventId = 'eb6d3a2f-8355-4e4b-948d-451ae3ed91fa';
  const endpointId = '5bed23b4-beb5-4b91-a903-ac3283626a3f';
  let sentBody: Buffer | undefined;
  let service: WebhooksService;

  const respond = (statusCode: number) => {
    mocked.request.mockImplementationOnce(
      (
        _url: URL,
        _options: RequestOptions,
        callback: (response: IncomingMessage) => void,
      ) => {
        const response = new EventEmitter() as IncomingMessage;
        Object.assign(response, { statusCode });
        const outgoing = new EventEmitter() as ClientRequest;
        Object.assign(outgoing, {
          end: (body: Buffer) => {
            sentBody = body;
            callback(response);
            queueMicrotask(() => response.emit('end'));
          },
          destroy: (error: Error) => outgoing.emit('error', error),
        });
        return outgoing;
      },
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sentBody = undefined;
    const db = {
      webhookEndpoint: {
        findFirst: vi.fn().mockResolvedValue({
          id: endpointId,
          url: 'https://8.8.8.8/ticketrush',
          active: true,
          secretCiphertext: encryptWebhookSecret(secret, key),
        }),
      },
    } as unknown as Database;
    service = new WebhooksService(db);
  });

  it('pins HTTPS requests to the vetted address and signs timestamp plus exact body', async () => {
    respond(204);
    await expect(
      service.deliver({
        eventId,
        endpointId,
        payload: { id: eventId, type: 'order.paid' },
      }),
    ).resolves.toEqual({ delivered: true });

    const [url, options] = mocked.request.mock.calls[0] as [
      URL,
      RequestOptions,
    ];
    expect(url.hostname).toBe('8.8.8.8');
    expect(options.method).toBe('POST');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const headers = options.headers as Record<string, string | number>;
    expect(headers['x-ticketrush-event-id']).toBe(eventId);
    expect(sentBody).toBeDefined();
    expect(
      verifyWebhookSignature(
        sentBody!,
        String(headers['x-ticketrush-timestamp']),
        String(headers['x-ticketrush-signature']),
        secret,
      ),
    ).toBe(true);

    const lookup = options.lookup as unknown as (
      hostname: string,
      options: { all: true },
      callback: (
        error: Error | null,
        addresses: { address: string; family: number }[],
      ) => void,
    ) => void;
    const address = await new Promise<{ address: string; family: number }>(
      (resolve, reject) =>
        lookup('8.8.8.8', { all: true }, (error, addresses) =>
          error ? reject(error) : resolve(addresses[0]),
        ),
    );
    expect(address).toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('does not follow redirects and treats a redirect response as a delivery failure', async () => {
    respond(302);
    await expect(
      service.deliver({ eventId, endpointId, payload: { id: eventId } }),
    ).rejects.toThrow('HTTP 302');
    expect(mocked.request).toHaveBeenCalledTimes(1);
  });
});
