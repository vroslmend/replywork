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

The persistent queue adapter commits the delivery receipt and queue message together. The worker
archives a message only after recording its outcome. Chatwoot writes use a separate deterministic
source ID derived from the admitted delivery, and the provider checks for that source ID before it
repeats a request.

An outgoing reply becomes a public Chatwoot message. A handoff becomes a private operator note,
optional team assignment, and an open conversation. Business policy remains outside the provider.

## Read-only catalog decisions

The optional catalog responder accepts explicit `/catalog` requests through the existing worker. It
queries the `CatalogCapability` port, validates returned records, audits product IDs and result
count, and builds a reply from stored facts. Unsupported requests become handoff requests; no model
selects tools or grants permissions. Fixed replies remain the default worker mode.

The PostgreSQL adapter reads only approved catalog records. Search and response generation do not
reserve stock or perform commerce writes. The worker binds processing to its configured Chatwoot
account, but visitor identity needs separate implementation.

## Conversation control

The worker checks durable conversation state before making a decision and again before sending a
reply. Handoff saves a pause and its intent before calling the provider. The same delivery can retry
that saved handoff without rerunning the responder; other deliveries are audited as ignored and
archived. If the control store fails, processing fails rather than sending a reply.

Trusted database operators can pause, resume or inspect a conversation. Resume clears the handoff
intent and records a server-side admission cutoff, preventing older queued work from replaying.
State is scoped by provider, account and conversation in the private PostgreSQL schema. There is no
automatic expiry, public control endpoint or customer command that resumes automation.

These checks cannot cancel a provider request already in flight. The current boundary is one
controlled worker, not per-conversation concurrency coordination. Proactive operator replies also
need an explicit pause; outgoing Chatwoot events are filtered at admission. See
[conversation controls](conversation-control.md).
