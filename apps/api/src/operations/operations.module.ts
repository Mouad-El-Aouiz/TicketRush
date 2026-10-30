import {
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Registry,
  Histogram,
  Counter,
  collectDefaultMetrics,
} from 'prom-client';
import {
  Observable,
  from,
  interval,
  startWith,
  switchMap,
  distinctUntilChanged,
} from 'rxjs';
import { Public, Roles, CurrentUser, type Actor } from '../auth/auth.module.js';
import { Database } from '../database/database.module.js';
import { Runtime } from '../runtime/runtime.module.js';
import { uuid } from '../common/http.js';
import { EventsModule, EventsService } from '../events/events.module.js';
import {
  ReservationsModule,
  ReservationsService,
} from '../reservations/reservations.module.js';

@Injectable()
export class Metrics {
  readonly registry = new Registry();
  readonly requests = new Counter({
    name: 'ticketrush_http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly duration = new Histogram({
    name: 'ticketrush_http_duration_seconds',
    help: 'HTTP duration',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });
  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'ticketrush_' });
  }
}
@Controller('ops')
class OperationsController {
  constructor(
    private readonly db: Database,
    private readonly runtime: Runtime,
    private readonly metrics: Metrics,
  ) {}
  @Public() @Get('live') live() {
    return { status: 'ok' };
  }
  @Public() @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      await this.runtime.redis.ping();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('A dependency is unavailable');
    }
  }
  @Public() @Get('metrics') async scrape(@Res() res: Response) {
    res
      .type(this.metrics.registry.contentType)
      .send(await this.metrics.registry.metrics());
  }
}
@Controller('live')
class LiveController {
  constructor(
    private readonly events: EventsService,
    private readonly reservations: ReservationsService,
    private readonly runtime: Runtime,
  ) {}
  @Public()
  @Sse('events/:id')
  stream(@Param('id', uuid) id: string): Observable<{ data: unknown }> {
    return interval(2000).pipe(
      startWith(0),
      switchMap(() =>
        from(
          (async () => {
            const event = await this.events.detail(id);
            return {
              data: await Promise.all(
                event.categories.map((c) =>
                  this.reservations.availability(c.id),
                ),
              ),
            };
          })(),
        ),
      ),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    );
  }
  @Roles('CLIENT') @Post('events/:id/queue') async queue(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
  ) {
    await this.events.detail(id);
    return this.runtime.queue(id, actor.id);
  }
}
@Global()
@Module({
  imports: [EventsModule, ReservationsModule],
  controllers: [OperationsController, LiveController],
  providers: [Metrics],
  exports: [Metrics],
})
export class OperationsModule {}
