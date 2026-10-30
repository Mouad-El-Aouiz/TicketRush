import {
  Global,
  Injectable,
  Module,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { createHash } from 'node:crypto';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import {
  ticketsReady,
  declareNotifications,
  routing,
  inbox,
} from '@ticketrush/contracts';
import { messageContext } from '../common/context.js';

@Injectable()
export class Notifications implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopping = false;
  constructor(private readonly db: Database) {}
  get remote() {
    const env = environment();
    return (
      env.NODE_ENV !== 'test' &&
      Boolean(
        env.NOTIFICATIONS_BROKER_URL &&
        env.NOTIFICATIONS_URL &&
        env.NOTIFICATIONS_SERVICE_KEY,
      )
    );
  }
  async ready(orderId: string, userId: string, count: number) {
    if (!this.remote) {
      await this.db.notification.upsert({
        where: { orderId },
        create: {
          orderId,
          userId,
          message: 'Your tickets are ready. Download them from your orders.',
        },
        update: {},
      });
      return;
    }
    const hash = createHash('sha256')
      .update(`tickets.ready.v1:${orderId}`)
      .digest('hex');
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const event = ticketsReady.parse({
      eventId: id,
      version: 1,
      type: 'TICKETS_READY',
      orderId,
      userId,
      count,
      ...messageContext(),
    });
    await this.db.outbox.upsert({
      where: { id },
      create: {
        id,
        aggregateId: orderId,
        type: 'TICKETS_READY',
        payload: event,
      },
      update: {},
    });
  }
  async list(userId: string) {
    const legacy = await this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (!this.remote) return legacy;
    const env = environment();
    try {
      const response = await fetch(
        `${env.NOTIFICATIONS_URL}/internal/users/${userId}/notifications`,
        {
          headers: {
            'x-service-key': env.NOTIFICATIONS_SERVICE_KEY!,
            'x-correlation-id': messageContext().correlationId,
          },
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) throw new Error('Unavailable');
      const current = inbox.parse(await response.json());
      const seen = new Set(current.map((v) => v.orderId));
      return [...current, ...legacy.filter((v) => !seen.has(v.orderId))]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 50);
    } catch {
      throw new ServiceUnavailableException(
        'Notifications are temporarily unavailable',
      );
    }
  }
  onModuleInit() {
    if (!this.remote) return;
    this.timer = setInterval(() => {
      void this.dispatch().catch(() =>
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Notification outbox unavailable',
          }),
        ),
      );
    }, 2000);
    this.timer.unref();
  }
  private async publisher() {
    if (this.channel) return this.channel;
    const connection = await connect(environment().NOTIFICATIONS_BROKER_URL!, {
      timeout: 3000,
    });
    connection.on('error', () => {});
    connection.on('close', () => {
      if (this.connection === connection) {
        this.connection = undefined;
        this.channel = undefined;
      }
    });
    this.connection = connection;
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', () => {});
      channel.on('close', () => {
        if (this.channel === channel) this.channel = undefined;
        void connection.close().catch(() => {});
      });
      await declareNotifications(channel);
      this.channel = channel;
      return channel;
    } catch (error) {
      await connection.close().catch(() => {});
      throw error;
    }
  }
  async dispatch() {
    if (this.busy || this.stopping || !this.remote) return;
    this.busy = true;
    try {
      const events = await this.db.outbox.findMany({
        where: { type: 'TICKETS_READY', publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      if (!events.length) return;
      const channel = await this.publisher();
      for (const row of events) {
        if (this.stopping) break;
        const event = ticketsReady.parse(row.payload);
        let returned = false;
        const onReturn = () => {
          returned = true;
        };
        channel.once('return', onReturn);
        let timeout: NodeJS.Timeout | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Broker confirmation timed out')),
              5000,
            );
            channel.publish(
              routing.exchange,
              routing.key,
              Buffer.from(JSON.stringify(event)),
              {
                persistent: true,
                mandatory: true,
                contentType: 'application/json',
                messageId: event.eventId,
                correlationId: event.correlationId,
                headers: event.traceparent
                  ? { traceparent: event.traceparent }
                  : {},
              },
              (error: unknown) => {
                if (error) reject(new Error('Broker rejected publication'));
                else resolve();
              },
            );
          });
          if (returned) throw new Error('No notification route');
          await this.db.outbox.update({
            where: { id: row.id },
            data: { publishedAt: new Date() },
          });
        } finally {
          if (timeout) clearTimeout(timeout);
          channel.off('return', onReturn);
        }
      }
    } finally {
      this.busy = false;
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.connection?.close().catch(() => {});
  }
}
@Global()
@Module({ providers: [Notifications], exports: [Notifications] })
export class NotificationsModule {}
