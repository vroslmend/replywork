# replywork

The work behind the reply.

Replywork is a customer operations service that sits behind a conversation inbox. It accepts signed
events, reduces them to a small internal contract, and passes accepted work to the business systems
that can answer or act.

Chatwoot owns the channels, conversation history, and operator inbox. Replywork owns the business
rules, integration boundaries, approvals, and audit record.

## Current boundary

The repository currently implements and tests the inbound Chatwoot event boundary:

- HMAC verification over the original request body;
- replay-window checks;
- message validation and normalization;
- filtering for private, outgoing, and unsupported messages;
- stable delivery keys; and
- idempotent admission through an injected queue contract.

Database-backed delivery, outgoing replies, and human handoff will be added through the same
contracts. They are not represented here as finished features.

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

Copy `.env.example` to `.env` only when running an integration locally. Unit and contract tests do
not read local credentials or make network requests.

## Security

Transactional actions stay behind deterministic validation, identity checks, and explicit
confirmation or operator approval. A model may propose an action. It does not grant its own
permission to perform one.

Please report security problems privately as described in [SECURITY.md](SECURITY.md).

## Licence

The source is public for inspection and non-commercial use. Commercial use and competing hosted
copies require prior written permission. See [LICENSE.md](LICENSE.md).
