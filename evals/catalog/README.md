# Catalog interpretation evaluation

`questions.json` is the canonical synthetic dataset for the catalog interpreter. It covers named
products, IDs, price, availability, Roman Urdu questions, missing references, multiple products,
unsupported requests, mixed requests and attempted instruction overrides. No customer transcripts or
credentials belong here.

Preview the dataset without reading `.env`, connecting to a database or making model calls:

```sh
pnpm catalog:eval
pnpm catalog:eval --case product-price
```

To run against Google, set `GOOGLE_GENERATIVE_AI_API_KEY` and `REPLYWORK_CATALOG_MODEL` in the root
`.env` or terminal environment. Check account quota, billing and data terms first. The explicit
`--run` flag makes real API calls; it is not part of `pnpm verify` or CI. Begin with one case:

```sh
pnpm catalog:eval --run --case product-price
```

Then run all 24 cases when the single call works:

```sh
pnpm catalog:eval --run
```

For a free synthetic baseline, `gemini-3.5-flash-lite` is a starting candidate: Google lists
[structured output support](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and
[free input/output quota](https://ai.google.dev/gemini-api/docs/pricing) as of 2026-09-13. Actual
access and limits must be checked in your account. Keep the project on the Free tier if charges are
not authorized; do not enable billing just for this evaluation. Unpaid content may be used for
product improvement under [Google's terms](https://ai.google.dev/gemini-api/terms), so keep these
tests synthetic.

Use a separate project if another application already uses Gemini. Quotas are
[per project, not per key](https://ai.google.dev/gemini-api/docs/rate-limits); creating another key
in an existing project does not isolate its quota. Create the key privately in
[AI Studio](https://aistudio.google.com/api-keys) and never paste it into chat or commit it.

This uses the same Google adapter and prompt as the worker, without Chatwoot, Docker or PostgreSQL.
Calls run sequentially, once per selected case, with the adapter's 10-second timeout and no SDK
retries. The runner stops on the first provider or invalid-output error. Semantic mismatches do not
stop the run. Changing the dataset is capped at 30 cases by validation.

The JSON report includes the configured model ID, completion timestamp, expected and actual
requests, per-case timings, passed/mismatched/error counts and cases not run. Progress goes to
stderr. Raw provider errors, request headers and credentials are not included. Results are not
written to the repository; keep any saved run under ignored `_local/`, not as a public progress log.

A case passes only when kind, topic and query match the expected request. Query comparison ignores
case, Unicode compatibility differences and repeated whitespace. A broader query such as `tote`
instead of `canvas tote` fails: extraction should preserve the named product rather than widen the
search. Non-search decisions must have null query and topic. Any mismatch, error or unfinished case
produces a nonzero exit status. Interrupted runs are incomplete, not passing baselines.

The unknown-product case checks extraction, not whether the product exists; no-match behavior is
covered by catalog tests. This runner evaluates classification only. It does not verify catalog
retrieval, replies, takeover, live provider integration or safety under every possible input.
Passing this small dataset is not production readiness. Record the code commit with a saved run,
review failures, and add justified regression cases before changing the prompt. Do not weaken an
expected result merely to improve the score.
