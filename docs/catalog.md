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
Both modes still need Chatwoot API credentials for provider writes. The standalone search command
does not.

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

The configured worker rejects a delivery from a different Chatwoot account before searching or
writing to the provider. This account check does not establish the visitor's identity or authorize
an order lookup.

Database worker tests exercise signed admission, the real catalog adapter, outgoing reply requests,
no matches, private handoff requests, provider failure/retry and the account boundary. Chatwoot HTTP
responses remain controlled in these tests; a live instance is still unverified.

This explicit command is an integration boundary for controlled testing, not the intended final
customer interface. Natural-language selection, real catalog import, live commerce availability and
automatic detection of proactive operator takeover are separate work. Handoff now saves a durable
pause; trusted operators can also pause and resume using the
[conversation controls](conversation-control.md). Do not enable it on an unattended customer inbox.
