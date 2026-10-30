import { randomBytes, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  verifyWebhookSignature,
} from './webhooks.module.js';

describe('outgoing webhook secret and signature handling', () => {
  it('encrypts endpoint secrets with authenticated encryption', () => {
    const key = randomBytes(32);
    const secret = randomBytes(32).toString('base64url');
    const encrypted = encryptWebhookSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted, key)).toBe(secret);

    const [nonce, tag, ciphertext] = encrypted.split('.');
    const replacement = ciphertext.endsWith('0') ? '1' : '0';
    const tampered = `${nonce}.${tag}.${ciphertext.slice(0, -1)}${replacement}`;
    expect(() => decryptWebhookSecret(tampered, key)).toThrow();
  });

  it('authenticates the exact body and rejects malformed signatures', () => {
    const secret = randomBytes(32).toString('base64url');
    const body = Buffer.from('{"type":"order.paid"}');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(body)
      .digest('hex')}`;

    expect(verifyWebhookSignature(body, timestamp, signature, secret)).toBe(
      true,
    );
    expect(
      verifyWebhookSignature(Buffer.from('{}'), timestamp, signature, secret),
    ).toBe(false);
    expect(verifyWebhookSignature(body, 'stale', signature, secret)).toBe(
      false,
    );
    const expiredTimestamp = '1000000000';
    const expiredSignature = `sha256=${createHmac('sha256', secret)
      .update(`${expiredTimestamp}.`)
      .update(body)
      .digest('hex')}`;
    expect(
      verifyWebhookSignature(body, expiredTimestamp, expiredSignature, secret),
    ).toBe(false);
  });
});
