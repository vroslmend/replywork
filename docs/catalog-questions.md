# Catalog questions from the terminal

`catalog:ask` runs a single question through the catalog responder without a conversation provider.
Use it to check interpretation, approved PostgreSQL lookup and stored-fact replies together. It uses
the worker's responder and Google adapter, not a separate chatbot implementation.

Preview without loading `.env`, contacting Google or opening a database connection:

```sh
pnpm catalog:ask "What is the price and availability of the canvas tote?"
```

For a live run, configure these settings in the ignored root `.env` or terminal environment:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
GOOGLE_GENERATIVE_AI_API_KEY=your-private-key
REPLYWORK_CATALOG_MODEL=your-structured-output-model
```

Start the existing local database and apply the [catalog migration](catalog.md) if needed. The
command does not start Docker, apply migrations or seed products. Synthetic examples can be inserted
explicitly with `pnpm catalog:seed`; existing IDs are left unchanged. Do not use example products as
a client's real catalog.

The explicit `--run` flag contacts Google and reads the local database:

```sh
pnpm catalog:ask --run "What is the price and availability of the canvas tote?"
pnpm catalog:ask --run "Do you have the pocket notebook?"
pnpm catalog:ask --run "I need a refund"
```

Each invocation accepts one quoted, self-contained question of at most 2,000 characters. Use the
repository root as the working directory, or invoke the command with `pnpm -C`. This controlled path
rejects non-local database URLs and URL query parameters. It verifies the catalog table is reachable
before making a model call. Credentials are never included in output.

Only the question goes to Google. Catalog records remain in PostgreSQL and supply the rendered
reply; the model cannot write prices, stock or reply prose. Check the model's quota and data terms
before using it. Begin with synthetic questions, not customer transcripts. Each run makes at most
one model call with the existing timeout, output cap and no SDK retries. `/catalog` commands still
bypass interpretation, though this entrypoint requires the Google settings for live mode.

Output contains a reply or handoff decision and an in-memory audit of interpretation and lookup. The
audit is not persisted and does not contain the question or extracted query. Product IDs and counts
can appear in lookup entries, and replies contain the requested catalog facts. No messages are sent,
queue deliveries consumed, conversation controls changed or catalog rows written. A handoff here is
only a printed decision, not a real operator notification or durable pause. Errors exit
unsuccessfully with a generic message rather than exposing raw exceptions or secrets.

This is an operator verification tool, not a public endpoint, customer interface or worker
replacement. It does not verify webhook admission, provider delivery or takeover. Those boundaries
have separate tests; live Chatwoot compatibility remains independent. Offline tests use controlled
interpretation, and database tests use isolated synthetic fixtures. Live model checks are manual,
never part of CI.
