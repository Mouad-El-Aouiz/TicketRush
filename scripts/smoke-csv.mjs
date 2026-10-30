import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
const base = process.env.API_URL ?? "http://127.0.0.1:8080/api";
const name = `CSV smoke ${randomUUID()}`;
async function login(user) {
  const r = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `${user}@ticketrush.local`,
      password: process.env.DEMO_PASSWORD,
    }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).accessToken;
}
const owner = await login("organisateur"),
  admin = await login("admin");
try {
  const stream = Readable.from([
    "title,description,venue,startsAt,category,capacity,priceCents\n",
    `${name},Temporary CSV smoke fixture,Local,2030-11-15T18:00:00.000Z,Standard,10,2500\n`,
    `${name} invalid,Temporary CSV smoke fixture,Local,2030-11-15T18:00:00.000Z,Standard,-1,2500\n`,
  ]);
  const response = await fetch(`${base}/imports/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${owner}`, "content-type": "text/csv" },
    body: stream,
    duplex: "half",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 201);
  const report = await response.json();
  assert.equal(report.imported, 1);
  assert.equal(report.rejected, 1);
  assert.equal(report.errors[0].line, 3);
  const model = await fetch(
    base.replace(/\/api$/, "") + "/events-template.csv",
  );
  assert.equal(model.status, 200);
  console.log(
    JSON.stringify(
      { status: "passed", report, templateStatus: model.status },
      null,
      2,
    ),
  );
} finally {
  const res = await fetch(
    `${base}/events/mine?search=${encodeURIComponent(name)}&limit=50`,
    { headers: { authorization: `Bearer ${owner}` } },
  );
  assert.equal(res.status, 200);
  for (const event of (await res.json()).data) {
    assert.equal(event.title, name);
    const r = await fetch(`${base}/admin/events/${event.id}/withdraw`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: "Cleanup CSV smoke fixture" }),
    });
    assert.equal(r.status, 201);
  }
}
