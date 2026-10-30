import { vi } from 'vitest';
import { ResilientHttp } from './resilient-http.js';
describe('Payment resilience', () => {
  afterEach(() => vi.unstubAllGlobals());
  const options = {
    timeoutMs: 50,
    attempts: 2,
    threshold: 2,
    resetMs: 5,
    maxConcurrent: 1,
    backoffMs: 0,
  };
  it('retries transient 500 responses then succeeds', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const client = new ResilientHttp(options);
    expect((await client.request('https://provider.example', {})).status).toBe(
      200,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('opens after failures and permits recovery after cooldown', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const client = new ResilientHttp(options);
    await expect(
      client.request('https://provider.example', {}),
    ).rejects.toThrow('unavailable');
    await expect(
      client.request('https://provider.example', {}),
    ).rejects.toThrow('unavailable');
    await expect(
      client.request('https://provider.example', {}),
    ).rejects.toThrow('circuit');
    expect(fetcher).toHaveBeenCalledTimes(4);
    await new Promise((r) => setTimeout(r, 10));
    fetcher.mockResolvedValue(new Response('{}'));
    expect((await client.request('https://provider.example', {})).ok).toBe(
      true,
    );
  });
  it('isolates concurrent calls with a bulkhead', async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const client = new ResilientHttp(options);
    const first = client.request('https://provider.example', {});
    await expect(
      client.request('https://provider.example', {}),
    ).rejects.toThrow('capacity');
    release(new Response('{}'));
    await first;
  });
});
