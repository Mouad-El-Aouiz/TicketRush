import {
  Controller,
  Get,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import { TicketsModule, TicketsService } from '../tickets/tickets.module.js';
import {
  ReservationsModule,
  ReservationsService,
} from '../reservations/reservations.module.js';
import { Roles } from '../auth/auth.module.js';

@Injectable()
export class DeliveryService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private dead?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  constructor(
    private readonly db: Database,
    private readonly tickets: TicketsService,
    private readonly reservations: ReservationsService,
  ) {}
  onModuleInit() {
    if (environment().NODE_ENV === 'test') return;
    const env = environment();
    const connection = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue('ticketrush-delivery', { connection });
    this.dead = new Queue('ticketrush-dead-letter', { connection });
    this.worker = new Worker(
      'ticketrush-delivery',
      async (job) => {
        if (job.name === 'expire') return this.reservations.expire();
        const body = z.object({ orderId: z.uuid() }).parse(job.data);
        return this.tickets.fulfill(body.orderId);
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.dead
          ?.add(
            'delivery-failed',
            { originalJobId: job.id, data: job.data as unknown },
            { jobId: job.id },
          )
          .catch(() => console.error('Failed to record dead letter'));
      }
    });
    this.worker.on('error', () => console.error('Delivery worker unavailable'));
    this.timer = setInterval(() => {
      void this.dispatch().catch(() =>
        console.error('Outbox dispatch unavailable'),
      );
    }, 2000);
    this.timer.unref();
    void this.dispatch().catch(() =>
      console.error('Outbox dispatch unavailable'),
    );
  }
  async dispatch() {
    if (!this.queue || this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.db.outbox.findMany({
        where: { publishedAt: null, type: 'ORDER_PAID' },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const event of events) {
        await this.queue.add(
          'tickets',
          { orderId: event.aggregateId },
          {
            jobId: event.id,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 5000 },
          },
        );
        await this.db.outbox.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
      }
      await this.queue.add(
        'expire',
        {},
        {
          jobId: `expire-${Math.floor(Date.now() / 60000)}`,
          removeOnComplete: { count: 100 },
        },
      );
    } finally {
      this.dispatching = false;
    }
  }
  async status() {
    return this.queue
      ? this.queue.getJobCounts('waiting', 'active', 'completed', 'failed')
      : { disabled: true };
  }
  async failures() {
    return this.dead
      ? (await this.dead.getJobs(['waiting'], 0, 49)).map((j) => ({
          id: j.id,
          data: j.data as unknown,
        }))
      : [];
  }
  async retry(id: string) {
    const job = await this.queue?.getJob(id);
    if (!job || (await job.getState()) !== 'failed') return { retried: false };
    await job.retry();
    return { retried: true };
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
    await this.dead?.close();
  }
}
@Roles('ADMIN')
@Controller('admin/jobs')
class JobsController {
  constructor(private readonly delivery: DeliveryService) {}
  @Get() status() {
    return this.delivery.status();
  }
  @Get('dead-letter') failures() {
    return this.delivery.failures();
  }
  @Post(':id/retry') retry(@Param('id') id: string) {
    return this.delivery.retry(id);
  }
}
@Module({
  imports: [TicketsModule, ReservationsModule],
  providers: [DeliveryService],
  controllers: [JobsController],
  exports: [DeliveryService],
})
export class DeliveryModule {}
