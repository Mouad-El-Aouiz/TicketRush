import { z } from "zod";
export const ticketsReady = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    type: z.literal("TICKETS_READY"),
    orderId: z.uuid(),
    userId: z.uuid(),
    count: z.number().int().min(1).max(20),
    correlationId: z.uuid(),
    traceparent: z.string().max(200).optional(),
  })
  .strict();
export type TicketsReady = z.infer<typeof ticketsReady>;
export const inbox = z.array(
  z.object({
    id: z.uuid(),
    orderId: z.uuid(),
    userId: z.uuid(),
    message: z.string(),
    createdAt: z.string(),
  }),
);
export type Inbox = z.infer<typeof inbox>;
export const routing = {
  exchange: "ticketrush.events",
  key: "tickets.ready.v1",
  queue: "ticketrush.notifications.v1",
  deadExchange: "ticketrush.notifications.dead",
  deadQueue: "ticketrush.notifications.dead.v1",
  retryQueue: "ticketrush.notifications.retry.v1",
} as const;
export type BrokerRouting = { [Key in keyof typeof routing]: string };
interface TopologyChannel {
  assertExchange(
    name: string,
    type: string,
    options: { durable: boolean },
  ): Promise<unknown>;
  assertQueue(
    name: string,
    options: { durable: boolean; arguments?: Record<string, unknown> },
  ): Promise<unknown>;
  bindQueue(queue: string, exchange: string, key: string): Promise<unknown>;
}
export async function declareNotifications(
  channel: TopologyChannel,
  spec: BrokerRouting = routing,
) {
  await channel.assertExchange(spec.exchange, "topic", { durable: true });
  await channel.assertExchange(spec.deadExchange, "fanout", {
    durable: true,
  });
  await channel.assertQueue(spec.queue, {
    durable: true,
    arguments: { "x-dead-letter-exchange": spec.deadExchange },
  });
  await channel.bindQueue(spec.queue, spec.exchange, spec.key);
  await channel.assertQueue(spec.deadQueue, { durable: true });
  await channel.bindQueue(spec.deadQueue, spec.deadExchange, "");
  await channel.assertQueue(spec.retryQueue, {
    durable: true,
    arguments: {
      "x-message-ttl": 5000,
      "x-dead-letter-exchange": spec.exchange,
      "x-dead-letter-routing-key": spec.key,
    },
  });
}
