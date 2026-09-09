# Architecture

Replywork is one product with two runtime entrypoints. The API authenticates and records incoming
work. The worker performs accepted work and returns a reply or handoff through the conversation
provider.

```text
channel
  |
Chatwoot
  |
signed webhook
  |
API -> delivery receipt -> queue -> worker
                                |      |
                                |      +-> audit record
                                |
                     capability adapters
```

## Package boundaries

- `contracts` contains validated data shapes shared across boundaries.
- `core` contains business flow and ports. It does not import provider SDKs.
- `adapters` translates external systems into core ports.
- `testkit` provides deterministic in-memory implementations for tests.
- `service` owns HTTP and worker entrypoints.

Chatwoot owns transport, conversation history, and the operator inbox. Replywork does not rebuild
those features.

## Admission before processing

The webhook path verifies the signature over the original bytes, rejects stale requests, normalizes
supported events, and asks the delivery queue to enqueue the delivery once. A successful response
means the work has been admitted, not completed.

The persistent queue adapter will commit the delivery receipt and queue message together. The worker
will acknowledge a message only after recording its outcome. External writes will use a separate
idempotency key derived from the admitted delivery.
