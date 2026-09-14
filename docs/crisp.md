# Crisp integration

Replywork supports signed Crisp plugin webhooks and operator replies through the REST API. The
adapter follows the official API contract and is tested against controlled HTTP responses. The
development path has also been verified with a permanent Free workspace and private plugin token.

## Local development setup

Use a dedicated test workspace. Do not install the widget on a live portfolio or customer site.

1. Create a private Replywork plugin in the Crisp Marketplace.
2. In **Tokens**, link the test workspace as the trusted workspace. Development credentials do not
   work until this is done; their current limit is 500 requests per 24 hours.
3. Save the development token identifier and key in the ignored local `.env` file.
4. Under **Settings → Events**, create a Development Web Hook pointing to your temporary public
   HTTPS endpoint at `/webhooks/crisp`. Subscribe only to `message:send`.
5. Save the signing secret shown by that modal as `CRISP_WEBHOOK_SECRET`. This is separate from the
   REST API token key. Do not paste either secret into chat or commit it.
6. Set the workspace's website ID and choose the provider in `.env`:

```dotenv
REPLYWORK_PROVIDER=crisp
CRISP_WEBSITE_ID=<test workspace website ID>
CRISP_PLUGIN_TOKEN_IDENTIFIER=<development identifier>
CRISP_PLUGIN_TOKEN_KEY=<development key>
CRISP_WEBHOOK_SECRET=<development webhook signing secret>
CRISP_API_BASE_URL=https://api.crisp.chat
```

Keep the existing local `DATABASE_URL`. Apply the migrations before admitting Crisp messages. Start
the API with `pnpm dev:service`; process one queued message with `pnpm worker:once`. Start with a
fixed synthetic reply, then select the already-tested catalog responder once the transport works.
Neither command automatically deploys anything.

The plugin's Toolkit callback, settings and action URLs, widget definition, public listing and
production token are not needed for this development check.

## Verified development boundary

The controlled live check used a localhost-only Crisp widget, a temporary Quick Tunnel, the one-shot
worker and synthetic catalog data. It established that:

- a signed customer `message:send` event reaches the durable queue and an API reply reaches Crisp;
- a locally signed replay of the recorded event is admitted as a duplicate and sends no second
  reply;
- a controlled API `503` leaves the delivery queued, and a later run through the real API succeeds;
- handoff marks the Crisp conversation unresolved and pauses local automation;
- messages received while paused are archived without catalog work or automated replies;
- operator-authored replies do not enter the customer automation queue; and
- after an explicit resume, `catalog-natural` answers an ordinary-language question from the
  approved PostgreSQL catalog and sends the stored-fact reply through Crisp.

The duplicate check reproduced Crisp's signed payload locally; it was not an observed Crisp retry.
Quick Tunnel URLs are temporary, the development token has a low daily limit, and `worker:once` does
not provide continuous processing. None of this establishes production approval or uptime.

## Delivery and handoff behavior

Only customer text messages enter the queue. A stable workspace/session/fingerprint key handles
webhook retries. Replies use a deterministic numeric fingerprint, with a lookup before sending to
avoid repeating an existing reply after worker failure.

Handoff pauses Replywork's automation in PostgreSQL and marks the Crisp conversation unresolved. It
does not create a private note or assign a team, because these are not part of the Free-plan
reference path. The saved handoff reason remains available in Replywork's state. Trusted operators
can pause or resume a Crisp session using `pnpm conversation:control <action> <session-id>`.
Operator messages are ignored; sending one does not itself pause automation.

The development setup is not a production hosting plan. Production tokens and webhook event scopes
may require Crisp approval; successful development tests do not prove that approval is granted.

## References

- [Plugin webhooks and signing secrets](https://docs.crisp.chat/guides/web-hooks/plugin-hooks/)
- [Webhook signature algorithm](https://docs.crisp.chat/references/web-hooks/v1/)
- [REST messages and conversation state](https://docs.crisp.chat/references/rest-api/v1/)
- [Plugin development and trusted workspace](https://docs.crisp.chat/guides/plugins/quickstart/)
