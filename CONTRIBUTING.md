# Contributing

Replywork is under active development. Please open an issue before starting a substantial change so
its scope and security implications can be agreed first.

## Local gate

Use Node.js 24 and pnpm 12. Before opening a pull request, run:

```bash
pnpm verify
```

The default test suite must not call Chatwoot, Supabase, WooCommerce, or a model provider. Use fakes
for unit and contract tests. Integration tests must be explicitly named and isolated from production
credentials and customer data.

## Pull requests

Keep each pull request focused. Explain the behavior being changed, the failure it prevents, and how
it was verified. Do not commit generated logs, local context, credentials, copied customer payloads,
or model transcripts containing personal information.

By submitting a contribution, you agree that it is provided under the terms in
[LICENSE.md](LICENSE.md).
