import { fileURLToPath } from "node:url";
import { Verifier } from "@pact-foundation/pact";
import { it } from "vitest";
import { z } from "zod";
import { createNotificationsHttpServer } from "./http-server.js";
import { InboxStore } from "./store.js";

const serviceKey = "pact-contract-test-service-key-not-a-secret";
const pactFile = fileURLToPath(
  new URL(
    "../../../pacts/TicketRush API-TicketRush Notifications.json",
    import.meta.url,
  ),
);

it("verifies the API consumer contract against the Notifications HTTP provider", async () => {
  const store = new InboxStore(":memory:");
  const consumer = {
    ready: true,
    counts: { processed: 0, duplicate: 0, retried: 0, dead: 0 },
  };
  const server = createNotificationsHttpServer(store, consumer, serviceKey);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Provider test server did not bind to a TCP port");

  try {
    await new Verifier({
      provider: "TicketRush Notifications",
      providerBaseUrl: `http://127.0.0.1:${address.port}`,
      pactUrls: [pactFile],
      logLevel: "error",
      stateHandlers: {
        "a user has a ready-ticket notification": (parameters) => {
          const state = z
            .object({
              eventId: z.uuid(),
              orderId: z.uuid(),
              userId: z.uuid(),
            })
            .parse(parameters);
          store.accept({
            version: 1,
            type: "TICKETS_READY",
            ...state,
            count: 1,
            correlationId: "46464646-4646-4464-a464-464646464646",
          });
          return Promise.resolve();
        },
      },
    }).verifyProvider();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    store.close();
  }
});
