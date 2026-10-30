import { describe, expect, it, vi } from 'vitest';
import { parseWebhookUrl, resolveWebhookTarget } from './webhook-target.js';

describe('outgoing webhook destination validation', () => {
  it.each([
    'http://example.com/hook',
    'https://user:pass@example.com/hook',
    'https://example.com:8443/hook',
    'https://example.com/hook?token=secret',
    'https://example.com/hook#fragment',
    'https://localhost/hook',
    'https://service.internal/hook',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => parseWebhookUrl(url)).toThrow();
  });

  it('rejects private, special-use and mapped IPv4 DNS answers', async () => {
    for (const address of [
      '10.2.3.4',
      '100.64.0.1',
      '127.0.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '169.254.2.3',
      '192.168.1.1',
      '::1',
      'fe80::1',
      'fc00::1',
      '::ffff:127.0.0.1',
      '2001:db8::1',
    ]) {
      await expect(
        resolveWebhookTarget('https://receiver.example/hook', () =>
          Promise.resolve([{ address, family: address.includes(':') ? 6 : 4 }]),
        ),
      ).rejects.toThrow('non-public');
    }
  });

  it('rejects a mixed public/private DNS answer set and an empty answer set', async () => {
    await expect(
      resolveWebhookTarget('https://receiver.example/hook', () =>
        Promise.resolve([
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.2', family: 4 },
        ]),
      ),
    ).rejects.toThrow('non-public');
    await expect(
      resolveWebhookTarget('https://receiver.example/hook', () =>
        Promise.resolve([]),
      ),
    ).rejects.toThrow('non-public');
  });

  it.each(['127.0.0.1', '192.168.1.1', '::1', 'fe80::1'])(
    'rejects non-public IP literal %s',
    async (address) => {
      const url = address.includes(':')
        ? `https://[${address}]/hook`
        : `https://${address}/hook`;
      await expect(resolveWebhookTarget(url)).rejects.toThrow('non-public');
    },
  );

  it('pins a public DNS result and preserves the HTTPS hostname', async () => {
    const lookup = vi.fn(() =>
      Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
    );
    const target = await resolveWebhookTarget(
      'https://receiver.example/events',
      lookup,
    );
    expect(target.url.hostname).toBe('receiver.example');
    expect(target.address).toBe('8.8.8.8');
    expect(lookup).toHaveBeenCalledWith('receiver.example', {
      all: true,
      verbatim: true,
    });
  });

  it('accepts a globally routable IPv6 result', async () => {
    const target = await resolveWebhookTarget(
      'https://receiver.example/events',
      () => Promise.resolve([{ address: '2606:4700:4700::1111', family: 6 }]),
    );
    expect(target.address).toBe('2606:4700:4700::1111');
    expect(target.family).toBe(6);
  });

  it('rejects a DNS answer whose address family does not match its address', async () => {
    await expect(
      resolveWebhookTarget('https://receiver.example/hook', () =>
        Promise.resolve([{ address: '8.8.8.8', family: 6 }]),
      ),
    ).rejects.toThrow('invalid address family');
  });
});
