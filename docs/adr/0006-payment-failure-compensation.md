# ADR 0006 — Compensate a failed payment by releasing its hold

## Context

A failed payment webhook previously changed only the payment row. The order remained pending and its active hold could continue reducing the visible stock until the ten-minute expiration, even though the provider had conclusively rejected the payment. A later success notification must never issue tickets against stock already sold to another customer.

## Decision

Handle a valid `FAILED` webhook in the existing PostgreSQL transaction: record its idempotency receipt, mark the payment failed, expire the hold, and expire the order. These changes commit or roll back together. If a distinct late success arrives afterward, mark the payment refunded and issue no tickets. Replays of either webhook remain idempotent.

## Alternatives considered

- Keep the hold until its original deadline: simple, but delays stock recovery after a conclusive decline.
- Reuse the hold after failure: rejected because the provider may later report success and because payment retries need a fresh reservation and payment reference.
- Release stock in a separate BullMQ job: rejected because a crash between payment state and release would leave inconsistent business state.

## Consequences

The customer must create a new reservation after a failed payment. Stock is available as soon as the failure transaction commits. The customer-facing order status is `EXPIRED`; payment status remains `FAILED`, or becomes `REFUNDED` if a late success is received. Tests verify stock restoration, replay safety, and late-success handling against PostgreSQL.
