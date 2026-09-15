# Replywork local demonstration

A localhost-only synthetic catalog-and-handoff demonstration for Replywork's existing Crisp
integration. It retains the test surface without adding a second inbox, browser database controls or
a new frontend framework.

The page lists test questions with the replies the responder produces for the seed catalog. Expected
replies are static text; the page does not read the database or show live conversation state. The
bundled Commissioner and Atkinson Hyperlegible Mono fonts are distributed under the SIL Open Font
License; see `fonts/`. `assets/figure/reply-sources.html` is the source for the README figure.

Run `corepack pnpm demo:crisp` from the repository root, then open `http://127.0.0.1:3001`. The page
renders without credentials. Only the public test-workspace website ID is served; the Crisp script
loads after an explicit click. Example buttons copy text, never send it.

Follow the [complete workflow](../../docs/demo.md) for a live roundtrip, human takeover and
shutdown.
