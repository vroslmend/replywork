# Catalog lookup

`PostgresCatalog` implements the core `CatalogCapability` port. It reads approved products from
`replywork.catalog_items` and returns their name, description, currency, minor-unit price and
availability. It does not change stock, create orders or send conversation replies.

## Search behavior

Queries match an exact, case-sensitive product ID or a case-insensitive substring of the name or
description. An exact ID comes first, followed by name and ID for stable ordering. Search input is
trimmed, limited to 200 characters and passed as SQL parameters. `%` and `_` are literal characters,
not wildcards. This is a small catalog lookup, not semantic search or a natural-language responder.

Only records with `approved = true` are returned. Approval defaults to false and is a trusted
data-maintenance decision, not a property inferred by a model. Unavailable products remain visible
with `available = false`. No matches returns an empty list; the command reports `not-found`.

Prices are integers in the currency's minor unit. For example, `180000` in `PKR` means PKR 1,800.
The lookup does not calculate discounts, tax, delivery charges or a guaranteed checkout total.
Availability is the stored catalog value, not a reservation or live commerce check. The current
catalog belongs to one business per Replywork database; shared multi-tenant catalogs are not
supported.

## Local use

Use the existing Node.js and pnpm installation and the database-only Supabase environment. No new
dependencies or Chatwoot instance are needed. With Docker running, execute from the repository root:

```sh
pnpm exec supabase db start
pnpm exec supabase migration up --local
pnpm build
```

The migration creates the catalog table; it does not insert example products. Do not reset a
database to apply this migration. The table stays in the private `replywork` schema with row-level
security enabled and no public access policy.

Set `DATABASE_URL` in the root `.env` to the local PostgreSQL connection. No Chatwoot credentials
are required for these commands. Then explicitly insert the synthetic examples and search:

```sh
pnpm catalog:seed
pnpm catalog:search "canvas tote"
pnpm catalog:search --limit 2 "synthetic"
pnpm catalog:search "example-pocket-notebook"
pnpm catalog:search "nonexistent-product"
```

`catalog:seed` reads `supabase/seeds/catalog.example.sql`. It rejects non-local database hosts and
URL query parameters, inserts three synthetic products, and leaves existing IDs unchanged. Seeding
is not automatic on service startup or migration. Do not use these examples as a real store catalog.

`catalog:search` prints JSON with `status` (`found` or `not-found`) and `items`, then closes its
connection. The default limit is five; allowed limits are 1 through 20. Invalid queries and database
errors exit unsuccessfully instead of being represented as an empty catalog. Both commands read the
root `.env` when launched from the repository root.

## Verification

`pnpm verify` covers query and product validation, command arguments and the local-seeding guard
without connecting to a database. With the migration applied, `pnpm test:db` additionally checks
real PostgreSQL matching, ordering, approval filtering, unavailability, literal SQL input, no
matches and stored-data constraints. Its isolated synthetic records are removed after the tests;
existing catalog records are not changed.

## Conversation responder

Set `REPLYWORK_RESPONDER=catalog` in the worker environment to enable `CatalogResponder`.
Fixed-reply mode remains the default and requires `REPLYWORK_REPLY_TEXT`; catalog mode does not.
Both modes still need configured inbox-provider credentials for provider writes. The standalone
search command does not.

A visitor message such as `/catalog canvas tote` searches at most five approved products and replies
with their recorded name, ID, price, availability and description. No match produces an explicit
no-match reply. An empty or oversized catalog query produces usage guidance without searching. Other
messages request human handoff rather than being interpreted as catalog questions.

The responder validates adapter results and records successful or failed lookups in the delivery's
audit history. Successful records contain product IDs and result count, not the query or
conversation text. Database, validation or audit errors propagate to the worker so the delivery is
not archived as a successful reply. A retry can record another lookup; the audit is an attempt
history, not one entry per conversation.

Price conversion uses explicit ISO 4217 minor-unit values for EUR, GBP, JPY, KWD, PKR and USD. Other
currencies are displayed as raw minor units until their conversion is added and verified. Locale
display precision is not used to infer the stored unit. See the
[official currency list](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html).

The configured worker rejects a delivery from a different provider account before searching or
writing to the provider. This account check does not establish the visitor's identity or authorize
an order lookup.

Database worker tests exercise signed admission, the real catalog adapter, outgoing reply requests,
no matches, handoff requests, provider failure/retry and the account boundary. Provider HTTP
responses remain controlled in these tests. A separate
[Crisp development check](crisp.md#verified-development-boundary) verified a live catalog reply;
Chatwoot has not been checked against a live instance.

This explicit command remains an integration boundary for controlled testing. Real catalog import,
live commerce availability and automatic detection of proactive operator takeover are separate work.
Handoff now saves a durable pause; trusted operators can also pause and resume using the
[conversation controls](conversation-control.md). Do not enable it on an unattended customer inbox.

## Ordinary-language questions

`REPLYWORK_RESPONDER=catalog-natural` adds a Gemini interpreter through AI SDK Core. Set
`GOOGLE_GENERATIVE_AI_API_KEY` and an explicit `REPLYWORK_CATALOG_MODEL` in the root `.env` or
worker environment. There is no default model, credential reuse or automatic switch from fixed or
command-only mode. The chosen model must support structured output and be available to your account.

The interpreter receives only the current customer message, not account IDs, conversation history,
credentials or catalog results. Enabling this mode sends that text to Google's API. Check the
provider's data terms, quota and billing configuration before using it with customer messages.
Offline tests do not read local keys or contact Google.

The model returns one validated request: search with a product query and topic (`details`, `price`
or `availability`), clarify, or handoff. It has no tools and cannot supply customer-facing prose,
prices, stock, orders or permissions. Local code requires the search term to be mentioned in the
message, ignoring case and repeated whitespace, before querying approved catalog records.
Unmentioned terms produce clarification instead of an inferred product search.

Intended questions include "How much is the canvas tote?", "Do you have the pocket notebook?" and
"Tell me about the stoneware mug". Price and availability replies use recorded values and explicitly
avoid checkout totals or stock guarantees. Multiple matching products produce a name/ID
clarification for those topics rather than selecting one. Details requests list the bounded matches.
No match still produces the existing no-match reply.

The prompt directs greetings and missing product references to clarification, and order, payment,
shipping, discount, refund, policy and human-help requests to handoff. These are intended routing
rules, not proof of semantic accuracy or resistance to every prompt injection. Deterministic safety
comes from the read-only capability, output validation and fact renderer, not prompt wording. There
is no conversation memory, synonym expansion or follow-up resolution. Clarification requires another
self-contained message; unsupported actions are not implemented.

Existing `/catalog` requests bypass the model in both catalog modes. Other messages are limited to
2,000 characters before interpretation. Each interpretation uses one model call, a 10-second
timeout, a 512-token output limit and no SDK retries. Errors propagate to the queue worker; they are
not treated as a successful answer or silently replaced with a regex interpretation.

The delivery audit records interpretation kind/topic, mention-check outcome and lookup product
IDs/counts, not customer text, extracted query or model response. Queue admission still stores the
normalized message as before. SDK telemetry is disabled; managed model tracing is not configured.
Interpretation may repeat on worker retry. Paused conversations do not call the interpreter.

Tests cover schema validation, mention checks, grounded rendering, clarification, malformed model
output, provider failure and Google's actual SDK with a controlled transport. Database tests cover
signed admission through the real catalog and worker, including suppression after handoff. They do
not establish real model routing quality or live inbox-provider behavior. Evaluate the selected
model with synthetic messages, including mixed requests and adversarial inputs, before enabling
customer use.

The [catalog evaluation](../evals/catalog/README.md) provides 24 synthetic questions and a manually
invoked runner. `pnpm catalog:eval` previews without credentials or network calls. Explicit `--run`
uses the same interpreter as the worker and can start with a single `--case`; no Chatwoot instance
or database is needed. Offline runner tests verify scoring and failure handling, not live model
accuracy.

The [terminal question command](catalog-questions.md) also exercises ordinary questions through
interpretation, the local approved catalog and stored-fact rendering. It prints decisions without
sending replies or changing conversation state.

References: [structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data),
[Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai),
[request limits](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text).
