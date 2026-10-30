// Run after seeding: node --env-file=.env scripts/smoke-local.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.API_URL ?? "http://127.0.0.1:8080/api";
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Run local:setup first");
async function call(path, token, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
async function login(name) {
  return (
    await call("/auth/login", undefined, {
      email: `${name}@ticketrush.local`,
      password,
    })
  ).accessToken;
}
const organizer = await login("organisateur");
const customer = await login("client");
const controller = await login("controleur");
const admin = await login("admin");
if (process.argv[2] === "--cleanup") {
  assert.match(process.argv[3] ?? "", /^[a-f0-9-]{36}$/i);
  await call(`/admin/events/${process.argv[3]}/withdraw`, admin, {
    reason: "Cleanup local smoke fixture",
  });
  console.log("Smoke fixture withdrawn");
  process.exit(0);
}
let event;
try {
  event = await call("/events", organizer, {
    title: `Docker smoke ${randomUUID().slice(0, 8)}`,
    description: "Temporary local smoke fixture",
    venue: "Local smoke",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const category = await call(`/events/${event.id}/categories`, organizer, {
    name: "Smoke",
    capacity: 2,
    priceCents: 1500,
  });
  const controllerUser = await call("/auth/me", controller);
  await call(`/events/${event.id}/controllers`, organizer, {
    userId: controllerUser.id,
  });
  await call(`/events/${event.id}/publish`, organizer, {});
  const hold = await call("/reservations", customer, {
    categoryId: category.id,
    quantity: 1,
  });
  const key = randomUUID();
  const order = await call(
    "/orders",
    customer,
    { holdId: hold.id },
    { "idempotency-key": key },
  );
  const replay = await call(
    "/orders",
    customer,
    { holdId: hold.id },
    { "idempotency-key": key },
  );
  assert.equal(order.id, replay.id);
  await call(`/orders/${order.id}/simulate-payment`, customer, {
    status: "SUCCEEDED",
  });
  let paid;
  for (let i = 0; i < 30; i++) {
    paid = await call(`/orders/${order.id}`, customer);
    if (paid.tickets?.length === 1 && paid.tickets[0].pdfReady) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(paid.status, "PAID");
  assert.equal(paid.tickets.length, 1);
  const ticket = paid.tickets[0];
  assert.equal(ticket.pdfReady, true);
  const pdf = await fetch(`${base}/tickets/${ticket.id}/pdf`, {
    headers: { authorization: `Bearer ${customer}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  await call("/tickets/scan", controller, {
    eventId: event.id,
    code: ticket.code,
  });
  const duplicate = await fetch(`${base}/tickets/scan`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${controller}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ eventId: event.id, code: ticket.code }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(duplicate.status, 409);
} finally {
  if (event)
    await call(`/admin/events/${event.id}/withdraw`, admin, {
      reason: "Cleanup local smoke fixture",
    });
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      checks: [
        "publish",
        "reserve",
        "idempotency",
        "fake payment webhook",
        "async PDF delivery",
        "authorized PDF download",
        "single-use scan",
        "fixture withdrawn",
      ],
    },
    null,
    2,
  ),
);
