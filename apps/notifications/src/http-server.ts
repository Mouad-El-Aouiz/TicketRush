import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import type { Consumer } from "./consumer.js";
import { InboxStore } from "./store.js";

type NotificationConsumerState = Pick<Consumer, "ready" | "counts">;

export function createNotificationsHttpServer(
  store: InboxStore,
  consumer: NotificationConsumerState,
  serviceKey: string,
): Server {
  const digest = createHash("sha256").update(serviceKey).digest();
  const server = createServer((req, res) => {
    const correlation = z.uuid().safeParse(req.headers["x-correlation-id"]);
    const correlationId = correlation.success ? correlation.data : randomUUID();
    res.setHeader("x-correlation-id", correlationId);
    res.setHeader("content-type", "application/json");
    const reply = (status: number, data: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && req.url === "/health")
      return reply(200, { status: "ok" });
    if (req.method === "GET" && req.url === "/ready")
      return reply(consumer.ready ? 200 : 503, {
        status: consumer.ready ? "ok" : "unavailable",
      });
    if (req.method === "GET" && req.url === "/metrics") {
      res.setHeader("content-type", "text/plain; version=0.0.4");
      res.end(
        Object.entries(consumer.counts)
          .map(
            ([status, value]) =>
              `ticketrush_notification_messages_total{status="${status}"} ${value}`,
          )
          .join("\n") + "\n",
      );
      return;
    }
    const match = /^\/internal\/users\/([a-f0-9-]{36})\/notifications$/i.exec(
      req.url ?? "",
    );
    if (req.method !== "GET" || !match)
      return reply(404, {
        code: "HTTP_404",
        message: "Not found",
        correlationId,
      });
    const key = req.headers["x-service-key"];
    const candidate = createHash("sha256")
      .update(typeof key === "string" ? key : "")
      .digest();
    if (!timingSafeEqual(candidate, digest))
      return reply(401, {
        code: "HTTP_401",
        message: "Unauthorized",
        correlationId,
      });
    const user = z.uuid().safeParse(match[1]);
    if (!user.success)
      return reply(400, {
        code: "HTTP_400",
        message: "Invalid user identifier",
        correlationId,
      });
    try {
      return reply(200, store.list(user.data));
    } catch {
      return reply(503, {
        code: "HTTP_503",
        message: "Inbox unavailable",
        correlationId,
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
