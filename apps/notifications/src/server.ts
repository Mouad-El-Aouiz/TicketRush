import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";
import { Consumer } from "./consumer.js";
import { InboxStore } from "./store.js";
config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const parsed = z
  .object({
    NOTIFICATIONS_BROKER_URL: z.url(),
    NOTIFICATIONS_SERVICE_KEY: z.string().min(48),
    NOTIFICATIONS_HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
    NOTIFICATIONS_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  })
  .safeParse(process.env);
if (!parsed.success)
  throw new Error(
    `Invalid notifications configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  );
const env = parsed.data;
const path =
  process.env.NOTIFICATIONS_DB ??
  fileURLToPath(new URL("../storage/inbox.sqlite", import.meta.url));
await mkdir(dirname(path), { recursive: true });
const store = new InboxStore(path);
const consumer = new Consumer(env.NOTIFICATIONS_BROKER_URL, store);
const digest = createHash("sha256")
  .update(env.NOTIFICATIONS_SERVICE_KEY)
  .digest();
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
consumer.start();
server.listen(env.NOTIFICATIONS_PORT, env.NOTIFICATIONS_HOST, () =>
  console.log(
    JSON.stringify({ level: "info", message: "Notifications listening" }),
  ),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void consumer.close().finally(() => store.close());
    });
  });
