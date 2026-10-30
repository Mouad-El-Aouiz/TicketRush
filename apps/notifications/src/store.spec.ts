import { randomUUID } from "node:crypto";
import { mkdtempSync, unlinkSync, existsSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InboxStore } from "./store.js";
import { ticketsReady } from "@ticketrush/contracts";
describe("Notification consumer contract and idempotency", () => {
  let store: InboxStore;
  beforeEach(() => {
    store = new InboxStore(":memory:");
  });
  afterEach(() => store.close());
  const event = () => ({
    version: 1 as const,
    eventId: randomUUID(),
    type: "TICKETS_READY" as const,
    orderId: randomUUID(),
    userId: randomUUID(),
    count: 2,
    correlationId: randomUUID(),
  });
  it("accepts the producer contract and deduplicates five deliveries", () => {
    const body = event();
    expect(ticketsReady.parse(body)).toEqual(body);
    for (let i = 0; i < 5; i++) store.accept(body);
    expect(store.list(body.userId)).toHaveLength(1);
    expect(store.list(randomUUID())).toHaveLength(0);
  });
  it("rejects changed payloads and unsupported contract versions", () => {
    const body = event();
    store.accept(body);
    expect(() => store.accept({ ...body, count: 3 })).toThrow(
      "identifier reused",
    );
    expect(() => store.accept({ ...body, version: 2 })).toThrow();
    expect(store.list(body.userId)).toHaveLength(1);
  });
  it("deduplicates the business effect for distinct event identifiers", () => {
    const body = event();
    store.accept(body);
    store.accept({ ...body, eventId: randomUUID() });
    expect(store.list(body.userId)).toHaveLength(1);
  });
  it("retains inbox and receipts after closing and reopening its file", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "ticketrush-notifications-test-"),
    );
    const path = join(directory, "inbox.sqlite");
    const body = event();
    let persistent: InboxStore | undefined;
    try {
      persistent = new InboxStore(path);
      persistent.accept(body);
      persistent.close();
      persistent = new InboxStore(path);
      expect(persistent.list(body.userId)).toHaveLength(1);
      expect(persistent.accept(body)).toBe(false);
    } finally {
      persistent?.close();
      for (const suffix of ["", "-wal", "-shm"])
        if (existsSync(path + suffix)) unlinkSync(path + suffix);
      rmdirSync(directory);
    }
  });
});
