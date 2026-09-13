# Chatwoot integration

Chatwoot provides the inbox and channels. Replywork receives account webhooks and writes replies or
handoff requests through the application API. Use an existing instance with API and signed webhook
access, or the optional Compose example below. Offline development needs neither.

## Verification boundary

Unit tests cover signature checks, event filtering and provider requests. Database tests exercise
admission and processing against PostgreSQL with controlled Chatwoot HTTP responses. Neither proves
compatibility with a running Chatwoot instance.

The Compose example follows the upstream Docker guide and pins Chatwoot `v4.17.1-ce`. It has not
been booted. The pin is a reproducible integration target, not a production security recommendation.
Review release notes and security updates before deploying it.

The `worker:once` command sends a fixed configured reply by default. Optional catalog mode answers
explicit `/catalog` requests. Opt-in `catalog-natural` mode adds structured Gemini interpretation;
see the [catalog guide](catalog.md). No mode performs order actions. The handoff adapter can write a
private note, optionally assign a team and reopen a conversation. Handoff saves a durable pause;
manual takeover uses the [conversation controls](conversation-control.md). Live provider behavior is
still unverified; do not run this worker against an unattended customer inbox.

## Optional self-hosted example

Requires Docker Engine and Compose v2 on the chosen host. This is a manual integration environment,
not a managed production deployment. It does not need to run on your development PC.

From the repository root, copy `deploy/chatwoot/.env.example` to `deploy/chatwoot/.env`. Set
distinct random hexadecimal values for `SECRET_KEY_BASE` (at least 64 bytes), `POSTGRES_PASSWORD`
and `REDIS_PASSWORD` (at least 32 bytes each). Leave the real file untracked. Compose rejects empty
secrets. Do not reuse Replywork's webhook secret or API token for these values.

Only the dashboard is published, at `http://localhost:3001`. Redis and PostgreSQL remain internal,
and named volumes retain database data and uploads. No service restarts automatically. Its database
is separate from Replywork's Supabase database.

Validate configuration without starting services. Run from the repository root:

```sh
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml config --quiet
```

First start downloads images and allocates storage. Run only on a host where you intend to install
this environment:

```sh
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml run --rm rails bundle exec rails db:chatwoot_prepare
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml up -d
```

For first-account creation on this isolated environment, temporarily set `ENABLE_ACCOUNT_SIGNUP` to
`true`, recreate Rails with the `up -d` command, create the account, then restore `false` and
recreate Rails again. Create a dedicated website inbox and add the integration user as a
collaborator. Use a separate test page for the widget, not a production portfolio or customer
website.

Routine inspection and shutdown preserve data:

```sh
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml ps
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml logs --tail=100 rails sidekiq
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml stop
docker compose --env-file deploy/chatwoot/.env -f deploy/chatwoot/compose.yaml start
```

Avoid sharing logs without checking them for credentials and customer data. `down` removes
containers while keeping named volumes; `down -v` also deletes the database and uploads.

For a public deployment, follow upstream guidance for TLS, a reverse proxy that preserves
`api_access_token` headers, SMTP, storage, backups, updates and monitoring. This localhost example
does not configure those responsibilities. Generate the encryption keys documented upstream before
enabling MFA. Provider hosting is separate from Replywork hosting.

## Connect Replywork

Create an account webhook subscribed only to `message_created`. The webhook URL must be reachable
from Chatwoot, not just your browser:

- Docker Desktop with Replywork running on Windows: use
  `http://host.docker.internal:3000/webhooks/chatwoot` for the isolated test.
- Remote Chatwoot: use Replywork's HTTPS endpoint. Do not expose its database.
- Linux Docker: `host.docker.internal` may need a host-gateway mapping, or use a reachable service
  address on a shared network.

Use Chatwoot's webhook creation API or integration settings. The creation response includes the
webhook's signing `secret`; the pinned release nests the webhook under `payload.webhook`, while the
current API reference shows a flat response. Copy the secret from the returned webhook into
Replywork's root `.env`, not the Compose environment. If the instance returns no secret or sends
unsigned requests, resolve its version or configuration; do not disable signature verification.

Configure the existing root `.env.example` fields:

| Field                          | Value                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `CHATWOOT_ACCOUNT_ID`          | Numeric account ID for the test inbox                                                         |
| `CHATWOOT_API_ACCESS_TOKEN`    | Profile token for a user with access to that account and inbox                                |
| `CHATWOOT_BASE_URL`            | URL reachable by the Replywork worker; `http://localhost:3001` for the example                |
| `CHATWOOT_HANDOFF_TEAM_ID`     | Optional team in that account; leave blank otherwise                                          |
| `CHATWOOT_WEBHOOK_SECRET`      | Secret returned for this account webhook                                                      |
| `DATABASE_URL`                 | Replywork PostgreSQL connection with the repository migration applied                         |
| `PORT`                         | Replywork service port; defaults to `3000`                                                    |
| `REPLYWORK_REPLY_TEXT`         | Fixed text for the controlled reply check                                                     |
| `REPLYWORK_RESPONDER`          | `fixed` (default), `catalog` or `catalog-natural`; reply text is required only for fixed mode |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google API key; required only for `catalog-natural`                                           |
| `REPLYWORK_CATALOG_MODEL`      | Explicit structured-output model ID; required only for `catalog-natural`                      |

Run from the repository root so the entrypoints read its `.env`:

```sh
pnpm dev:service
```

Send one synthetic visitor message. Admission returns HTTP `202`; it does not mean the reply has
been sent. In a second terminal, run `pnpm worker:once`. Inspect the test conversation and audit
record. Each invocation processes at most one visible queue message and exits.

Chatwoot signs `{timestamp}.{raw_request_body}` with HMAC-SHA256 and prefixes the digest with
`sha256=`. Replywork checks the signature and a five-minute timestamp window. Keep clocks aligned
and preserve the original body and signature headers through any proxy.

## Remaining live checks

Before calling the integration verified, check signed admission, a visible reply, invalid-signature
rejection, duplicate inbound delivery, API failure and worker retry, and handoff
note/assignment/status against the chosen instance. Handoff needs a responder that chooses that
action; command-only catalog mode routes unsupported requests to handoff, while fixed mode does not.
Natural catalog mode also needs separate evaluation of the chosen model's routing. Operator takeover
after handoff now pauses automation durably. Before a proactive human reply, use the
[pause command](conversation-control.md); outgoing operator messages do not automatically pause
Replywork. Verify pause and explicit resume against the chosen inbox as part of the live check.

Outgoing deduplication currently checks the returned message list for a deterministic `source_id`
before sending. The release source accepts that field, but live preservation and message pagination
still need verification. This is not an atomic exactly-once guarantee under concurrent workers or
ambiguous network failures. Do not enable consequential business writes based on this check alone.

## References

- [Docker deployment guide](https://developers.chatwoot.com/self-hosted/deployment/docker)
- [Release Compose template](https://github.com/chatwoot/chatwoot/blob/v4.17.1/docker-compose.production.yaml)
- [Release environment template](https://github.com/chatwoot/chatwoot/blob/v4.17.1/.env.example)
- [Account webhook API and signature contract](https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook)
- [Release signature implementation](https://github.com/chatwoot/chatwoot/blob/v4.17.1/lib/webhooks/trigger.rb)
- [Release webhook response](https://github.com/chatwoot/chatwoot/blob/v4.17.1/app/views/api/v1/accounts/webhooks/create.json.jbuilder)
- [Release message builder](https://github.com/chatwoot/chatwoot/blob/v4.17.1/app/builders/messages/message_builder.rb)
