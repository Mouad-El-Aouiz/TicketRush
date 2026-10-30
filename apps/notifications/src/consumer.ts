import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from "amqplib";
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
} from "@opentelemetry/api";
import {
  ticketsReady,
  declareNotifications,
  routing,
  type BrokerRouting,
} from "@ticketrush/contracts";
import { InboxStore, EventConflictError } from "./store.js";
import { z } from "zod";
export class Consumer {
  ready = false;
  readonly counts = { processed: 0, duplicate: 0, retried: 0, dead: 0 };
  private connection?: ChannelModel;
  private timer?: NodeJS.Timeout;
  private stopping = false;
  constructor(
    private readonly url: string,
    private readonly store: InboxStore,
    private readonly topology: BrokerRouting = routing,
  ) {}
  start() {
    void this.connect().catch(() => this.retry());
  }
  private retry() {
    if (this.stopping || this.timer) return;
    this.ready = false;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.start();
    }, 2000);
  }
  private async connect() {
    if (this.stopping) return;
    const connection = await connect(this.url, { timeout: 3000 });
    this.connection = connection;
    connection.on("error", () => {});
    connection.on("close", () => {
      this.ready = false;
      this.retry();
    });
    try {
      const channel = await connection.createConfirmChannel();
      channel.on("error", () => {});
      channel.on("close", () => {
        void connection.close().catch(() => {});
      });
      await declareNotifications(channel, this.topology);
      await channel.prefetch(1);
      await channel.consume(
        this.topology.queue,
        (message) => {
          if (message)
            void this.handle(channel, message).catch(() => {
              try {
                channel.nack(message, false, true);
              } catch {
                /* Connection loss automatically requeues unacknowledged messages. */
              }
            });
        },
        { noAck: false },
      );
      this.ready = true;
    } catch (error) {
      await connection.close().catch(() => {});
      throw error;
    }
  }
  private async handle(channel: ConfirmChannel, message: ConsumeMessage) {
    if (this.stopping) {
      channel.nack(message, false, true);
      return;
    }
    if (message.content.length > 8192) {
      this.counts.dead++;
      channel.nack(message, false, false);
      return;
    }
    let event;
    try {
      event = ticketsReady.parse(
        JSON.parse(message.content.toString()) as unknown,
      );
    } catch {
      this.counts.dead++;
      channel.nack(message, false, false);
      return;
    }
    const carrier = event.traceparent ? { traceparent: event.traceparent } : {};
    await context.with(propagation.extract(context.active(), carrier), () =>
      trace
        .getTracer("ticketrush-notifications")
        .startActiveSpan("notifications.consume", async (span) => {
          try {
            const changed = this.store.accept(event);
            this.counts[changed ? "processed" : "duplicate"]++;
            console.log(
              JSON.stringify({
                level: "info",
                message: "Notification consumed",
                correlationId: event.correlationId,
                traceId: span.spanContext().traceId,
                eventId: event.eventId,
                duplicate: !changed,
              }),
            );
            channel.ack(message);
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: "Notification processing failed",
            });
            const rawAttempt: unknown = message.properties.headers?.attempt;
            const attempt = z
              .number()
              .int()
              .min(0)
              .max(5)
              .catch(0)
              .parse(rawAttempt);
            if (error instanceof EventConflictError || attempt >= 4) {
              this.counts.dead++;
              channel.nack(message, false, false);
              return;
            }
            let timeout: NodeJS.Timeout | undefined;
            try {
              await new Promise<void>((resolve, reject) => {
                timeout = setTimeout(
                  () => reject(new Error("Retry confirmation timed out")),
                  5000,
                );
                channel.sendToQueue(
                  this.topology.retryQueue,
                  message.content,
                  {
                    persistent: true,
                    contentType: "application/json",
                    messageId: event.eventId,
                    headers: { attempt: attempt + 1 },
                  },
                  (failure: unknown) =>
                    failure
                      ? reject(new Error("Retry publication failed"))
                      : resolve(),
                );
              });
              this.counts.retried++;
              channel.ack(message);
            } finally {
              if (timeout) clearTimeout(timeout);
            }
          } finally {
            span.end();
          }
        }),
    );
  }
  async close() {
    this.stopping = true;
    this.ready = false;
    if (this.timer) clearTimeout(this.timer);
    await this.connection?.close().catch(() => {});
  }
}
