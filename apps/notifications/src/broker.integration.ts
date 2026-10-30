import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  routing,
  declareNotifications,
  type BrokerRouting,
} from "@ticketrush/contracts";
import { Consumer } from "./consumer.js";
import { InboxStore } from "./store.js";
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
describe("Real RabbitMQ delivery and recovery", () => {
  let connection: ChannelModel,
    channel: ConfirmChannel,
    consumer: Consumer,
    store: InboxStore;
  const spec = Object.fromEntries(
    Object.entries(routing).map(([key, value]) => [
      key,
      `${value}.test-${randomUUID()}`,
    ]),
  ) as BrokerRouting;
  const url = process.env.NOTIFICATIONS_BROKER_URL;
  const event = () => ({
    version: 1,
    eventId: randomUUID(),
    type: "TICKETS_READY",
    orderId: randomUUID(),
    userId: randomUUID(),
    count: 1,
    correlationId: randomUUID(),
  });
  async function until(check: () => boolean | Promise<boolean>) {
    const stop = Date.now() + 12000;
    while (!(await check())) {
      if (Date.now() > stop) throw new Error("Broker condition timed out");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function publish(body: string) {
    await new Promise<void>((resolve, reject) =>
      channel.publish(
        spec.exchange,
        spec.key,
        Buffer.from(body),
        { persistent: true },
        (error: unknown) =>
          error ? reject(new Error("Publication failed")) : resolve(),
      ),
    );
  }
  beforeAll(async () => {
    if (!url) throw new Error("Run pnpm local:setup first");
    store = new InboxStore(":memory:");
    connection = await connect(url, { timeout: 3000 });
    connection.on("error", () => {});
    channel = await connection.createConfirmChannel();
    channel.on("error", () => {});
    await declareNotifications(channel, spec);
    consumer = new Consumer(url, store, spec);
    consumer.start();
    await until(() => consumer.ready);
  });
  afterAll(async () => {
    await consumer?.close();
    if (channel) {
      for (const queue of [spec.queue, spec.retryQueue, spec.deadQueue])
        await channel.deleteQueue(queue);
      await channel.deleteExchange(spec.exchange);
      await channel.deleteExchange(spec.deadExchange);
    }
    await connection?.close();
    store?.close();
  });
  it("deduplicates five deliveries through the real broker", async () => {
    const body = event();
    for (let i = 0; i < 5; i++) await publish(JSON.stringify(body));
    await until(() => consumer.counts.duplicate === 4);
    expect(store.list(body.userId)).toHaveLength(1);
  });
  it("retains a persistent message while the consumer is stopped", async () => {
    await consumer.close();
    const body = event();
    await publish(JSON.stringify(body));
    expect((await channel.checkQueue(spec.queue)).messageCount).toBe(1);
    consumer = new Consumer(url!, store, spec);
    consumer.start();
    await until(() => store.list(body.userId).length === 1);
    expect(consumer.ready).toBe(true);
  });
  it("dead-letters an invalid contract instead of requeueing forever", async () => {
    await publish("not-json");
    await until(async () =>
      Boolean((await channel.checkQueue(spec.deadQueue)).messageCount),
    );
    const dead = await channel.get(spec.deadQueue, { noAck: false });
    expect(dead).not.toBe(false);
    if (dead) {
      expect(dead.content.toString()).toBe("not-json");
      channel.ack(dead);
    }
  });
  it("retries a transient store error with broker delay before acknowledging", async () => {
    const body = event();
    const spy = vi.spyOn(store, "accept").mockImplementationOnce(() => {
      throw new Error("Transient store failure");
    });
    try {
      await publish(JSON.stringify(body));
      await until(() => consumer.counts.retried === 1);
      expect(store.list(body.userId)).toHaveLength(0);
      await until(() => store.list(body.userId).length === 1);
    } finally {
      spy.mockRestore();
    }
  });
});
