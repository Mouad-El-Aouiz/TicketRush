import {
  Global,
  Injectable,
  Module,
  OnModuleDestroy,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { environment } from '../config/environment.js';
class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, 429);
  }
}

@Injectable()
export class Runtime implements OnModuleDestroy {
  private cacheHealthy = true;
  readonly redis: Redis;
  constructor() {
    const env = environment();
    this.redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2500,
      enableOfflineQueue: true,
    });
    this.redis.on('error', () => {});
  }
  async limit(key: string, max: number, seconds = 60) {
    if (environment().NODE_ENV === 'test') return;
    try {
      const count = await this.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
        1,
        `limit:${key}`,
        seconds,
      );
      if (Number(count) > max)
        throw new TooManyRequestsException(
          'Too many requests; try again later',
        );
    } catch (error) {
      if (error instanceof TooManyRequestsException) throw error;
      throw new ServiceUnavailableException(
        'Request protection is temporarily unavailable',
      );
    }
  }
  async cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (
      environment().NODE_ENV === 'test' ||
      !this.cacheHealthy ||
      process.env.CACHE_ENABLED === 'false'
    )
      return loader();
    let cacheKey: string | undefined;
    try {
      const version = (await this.redis.get('catalog-version')) ?? '0';
      cacheKey = `catalog:${version}:${createHash('sha256').update(key).digest('hex')}`;
      const hit = await this.redis.get(cacheKey);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* Cache failure must not stop catalogue reads. */
    }
    const value = await loader();
    if (cacheKey)
      try {
        await this.redis.set(cacheKey, JSON.stringify(value), 'EX', 30);
      } catch {
        /* Best effort cache fill. */
      }
    return value;
  }
  async invalidate() {
    try {
      await this.redis.incr('catalog-version');
      this.cacheHealthy = true;
    } catch {
      this.cacheHealthy = false;
    }
  }
  async queue(eventId: string, userId: string) {
    const key = `admission:${eventId}`;
    const now = Date.now();
    const rank = await this.redis.eval(
      "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); redis.call('ZADD',KEYS[1],'NX',ARGV[2],ARGV[3]); redis.call('EXPIRE',KEYS[1],300); return redis.call('ZRANK',KEYS[1],ARGV[3])",
      1,
      key,
      now - 120000,
      now,
      userId,
    );
    return {
      position: Number(rank) + 1,
      admitted: Number(rank) < 50,
      expiresIn: 120,
    };
  }
  async leave(eventId: string, userId: string) {
    await this.redis.zrem(`admission:${eventId}`, userId);
  }
  onModuleDestroy() {
    this.redis.disconnect();
  }
}
@Global()
@Module({ providers: [Runtime], exports: [Runtime] })
export class RuntimeModule {}
