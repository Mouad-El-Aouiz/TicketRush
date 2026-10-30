import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";
import { Consumer } from "./consumer.js";
import { createNotificationsHttpServer } from "./http-server.js";
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
const server = createNotificationsHttpServer(
  store,
  consumer,
  env.NOTIFICATIONS_SERVICE_KEY,
);
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
