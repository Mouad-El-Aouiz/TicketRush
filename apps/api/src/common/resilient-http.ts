import { ServiceUnavailableException } from '@nestjs/common';
export class ResilientHttp {
  private failures = 0;
  private openedAt = 0;
  private active = 0;
  private probing = false;
  constructor(
    private readonly options = {
      timeoutMs: 6000,
      attempts: 3,
      threshold: 3,
      resetMs: 30000,
      maxConcurrent: 8,
      backoffMs: 100,
    },
  ) {}
  snapshot() {
    return {
      failures: this.failures,
      open: this.openedAt > 0,
      active: this.active,
    };
  }
  async request(url: string, options: RequestInit): Promise<Response> {
    const recovering = this.openedAt > 0;
    if (
      recovering &&
      (Date.now() - this.openedAt < this.options.resetMs || this.probing)
    )
      throw new ServiceUnavailableException('Payment circuit is open');
    if (this.active >= this.options.maxConcurrent)
      throw new ServiceUnavailableException('Payment capacity is busy');
    this.active++;
    if (recovering) this.probing = true;
    try {
      for (let attempt = 0; attempt < this.options.attempts; attempt++) {
        try {
          const response = await fetch(url, {
            ...options,
            signal: AbortSignal.timeout(this.options.timeoutMs),
          });
          if (response.status >= 500) {
            await response.body?.cancel();
            throw new Error('Provider failed');
          }
          this.failures = 0;
          this.openedAt = 0;
          return response;
        } catch {
          /* Retry only within the bounded attempts and timeout budget. */
        }
        if (attempt + 1 < this.options.attempts)
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              this.options.backoffMs * 2 ** attempt +
                Math.random() * this.options.backoffMs,
            ),
          );
      }
      this.failures++;
      if (this.failures >= this.options.threshold || recovering)
        this.openedAt = Date.now();
      throw new ServiceUnavailableException(
        'Payment provider unavailable; verify order status before retrying',
      );
    } finally {
      this.active--;
      this.probing = false;
    }
  }
}
