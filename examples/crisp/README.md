# Replywork local demonstration

A localhost-only synthetic catalog-and-handoff demonstration for Replywork's existing Crisp
integration. It retains the test surface without adding a second inbox, browser database controls or
a new frontend framework. The source-record layout and Replywork SVG mark are repository-native
assets.

The main visual switches between three explicitly illustrative cases without contacting a model,
database or inbox provider. It does not claim to display current state or an actual handoff reply.

Run `corepack pnpm demo:crisp` from the repository root, then open `http://127.0.0.1:3001`. The page
renders without credentials. Only the public test-workspace website ID is served; the Crisp script
loads after an explicit click. Example buttons copy text, never send it.

Follow the [complete workflow](../../docs/demo.md) for a live roundtrip, human takeover and
shutdown.
