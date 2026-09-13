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

The conversation worker still uses its configured fixed reply. Connecting catalog results to a
responder, selecting products from natural language, importing a real catalog and confirming live
commerce availability are separate integrations.
