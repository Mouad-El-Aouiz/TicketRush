# ADR 0007 — Deliver organizer webhooks over pinned public HTTPS

## Context

Organizers need payment updates without polling. A webhook endpoint is a URL supplied by a user and makes the API perform a server-side request, so an unrestricted URL could reach loopback, private networks, cloud metadata, or internal services. DNS can also return a different address between validation and connection. Endpoint signing keys must remain recoverable for signing but hidden from routine API reads and logs.

## Decision

Organizers can create, list, rotate and delete endpoints that belong to their account. Endpoints accept only HTTPS on the default port, with no user information, query or fragment. Every A/AAAA answer must be public unicast; IP literals receive the same range checks. Resolve at registration and again before delivery, pin the validated address in the HTTPS socket lookup, use the URL hostname for TLS verification, and do not follow redirects. Bound request bodies to 32 KiB, response reads to 8 KiB, and request time to five seconds.

Generate a random 256-bit endpoint secret. Encrypt it at rest with AES-256-GCM under a separate `WEBHOOK_ENCRYPTION_KEY`; reveal the plaintext only on create and rotation. Sign the exact body using HMAC-SHA256 over `<unix timestamp>.<body bytes>`. Send `order.paid` events through BullMQ with stable event IDs, bounded exponential retries and the existing dead-letter queue. Do not include customer data in the event payload.

## Alternatives considered

- Use the built-in `fetch` without address pinning: rejected because a second DNS lookup can be redirected to a private address after validation.
- Follow redirects: rejected because a public URL could redirect to an internal target.
- Store the endpoint secret in plaintext or store only its one-way hash: rejected because delivery needs the signing key, while plaintext storage unnecessarily exposes credentials.
- Deliver inline in the payment webhook transaction: rejected because endpoint latency or failure would delay payment confirmation and couple two systems.

## Consequences

Endpoints must be publicly reachable via HTTPS on port 443; private local receivers are intentionally unsupported. The encryption key must be preserved across restarts and backups. DNS is validated on every delivery, which adds one resolution per endpoint job. Delivery is at least once: receivers must verify the five-minute signature window and deduplicate `x-ticketrush-event-id`. HTTP redirects, private targets and non-2xx responses do not count as success. Offline tests inject DNS answers and HTTPS responses without sending network requests.
