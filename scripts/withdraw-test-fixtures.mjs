// Withdraw only the known integration fixtures left by older test runs.
import { Database } from "../apps/api/dist/database/database.module.js";
import { Runtime } from "../apps/api/dist/runtime/runtime.module.js";
if (
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error("Local database required");
const db = new Database();
const runtime = new Runtime();
try {
  const events = await db.event.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { title: "Concurrency fixture", description: "Integration event" },
        {
          title: "Integration concert",
          description: "An integration event for concurrent booking.",
        },
      ],
    },
    select: { id: true, organizer: { select: { email: true } } },
  });
  const ids = events
    .filter((event) =>
      /^(organizer|test)-[a-f0-9-]{36}@example\.com$/i.test(
        event.organizer.email,
      ),
    )
    .map((event) => event.id);
  const result = await db.event.updateMany({
    where: { id: { in: ids } },
    data: { status: "WITHDRAWN" },
  });
  await runtime.invalidate();
  console.log(JSON.stringify({ withdrawnKnownTestFixtures: result.count }));
} finally {
  runtime.onModuleDestroy();
  await db.onModuleDestroy();
}
