# replywork

The work behind the reply.

Replywork is a customer operations service that sits behind a conversation inbox. It accepts signed
events, reduces them to a small internal contract, and passes accepted work to the business systems
that can answer or act.

Chatwoot owns the channels, conversation history, and operator inbox. Replywork owns the business
rules, integration boundaries, approvals, and audit record.

## Current boundary

The repository currently implements and tests the durable Chatwoot delivery path:

- HMAC verification over the original request body;
- replay-window checks;
- message validation and normalization;
- filtering for private, outgoing, and unsupported messages;
- atomic receipt and queue admission in PostgreSQL;
- a queue worker with visibility timeout, audit records, and archive-on-success behavior;
- outgoing replies through the Chatwoot application API;
- human handoff through a private note, optional team assignment, and an open conversation; and
- durable automation pause on handoff, with trusted pause/resume controls.

The default test suite remains offline. Database tests exercise the complete signed webhook to
outgoing API-request path against local PostgreSQL and a controlled HTTP boundary. A live Chatwoot
round trip remains an integration step rather than a claimed feature.

## Shape

```text
Chatwoot
   |
signed webhook
   |
Replywork API -> durable queue -> worker
                                  |
                    business capability adapters
                                  |
                  reply, approval, or handoff
```

The API and worker live in one service application. Shared packages hold contracts, business rules,
provider adapters, and test fixtures. This keeps deployment simple while preserving the boundaries
that later integrations need.

## Development

Requirements:

- Node.js 24
- pnpm 12

Install dependencies and run the complete local gate:

```bash
pnpm install
pnpm verify
```

Individual commands are available when working on one layer:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm worker:once` processes at most one admitted delivery and then exits. It is intended for
controlled integration work until a deployment needs a continuously polling worker.

Copy `.env.example` to `.env` only when running an integration locally. Unit and contract tests do
not read local credentials or make network requests.

For an existing instance or the optional self-hosted example, see the
[Chatwoot integration guide](docs/chatwoot.md). The example follows upstream documentation but has
not been booted or verified against a live instance. Chatwoot is not required for offline
development.

## Catalog

The read-only PostgreSQL catalog lookup returns approved product records with stored prices,
availability and descriptions. It supports bounded text search and exact product IDs, without
inventing missing products or changing business data. A local command and synthetic examples are
available in the [catalog guide](docs/catalog.md). Set `REPLYWORK_RESPONDER=catalog` to let the
worker answer explicit `/catalog` requests from recorded facts and hand off other requests. Fixed
replies remain the default. Opt-in `catalog-natural` mode uses Gemini to extract a bounded catalog
request, then builds the answer from stored facts. Its routing quality still needs live evaluation.
Handoff pauses automation until an operator explicitly resumes it. See the
[conversation control guide](docs/conversation-control.md) for behavior and limits.

## Security

Transactional actions stay behind deterministic validation, identity checks, and explicit
confirmation or operator approval. A model may propose an action. It does not grant its own
permission to perform one.

Please report security problems privately as described in [SECURITY.md](SECURITY.md).

## Licence

The source is public for inspection and non-commercial use. Commercial use and competing hosted
copies require prior written permission. See [LICENSE.md](LICENSE.md).
