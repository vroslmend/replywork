# Local sample: from question to reply

The supported sample is a synthetic catalog-and-handoff demonstration with Crisp's existing chat
widget. Replywork remains the service behind the inbox, not a replacement inbox UI. Nothing is
installed on your portfolio or a customer site, and no message is sent automatically.

The page lists three test questions and the reply each should produce. Highlighted values in an
expected reply match the seed catalog beside it. Copy buttons only copy text; nothing reaches Crisp
until you send it in the chat yourself.

## Render the page only

From the repository root, with Node.js 24 and Corepack available:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm demo:crisp
```

Open `http://127.0.0.1:3001`. No database or API keys are required to render the page. An empty
`CRISP_WEBSITE_ID` leaves chat disabled. If the ignored `.env` already contains a valid test ID,
chat is available but Crisp's script still loads only after clicking **Open test chat**.

The three displayed products mirror `supabase/seeds/catalog.example.sql`. These are illustrative
seed records, not a live database view. Replies use the database's current approved records, which
may differ if you edited or previously seeded them. The seed preserves existing IDs.

## Enable a development roundtrip

Use a dedicated test workspace and the private development-plugin path in the
[Crisp guide](crisp.md). Link its trusted workspace, save the development credentials and webhook
signing secret in the ignored root `.env`, and subscribe only to `message:send`. Production
activation, a public Marketplace listing and Toolkit URLs are not needed for this development path.

Start Docker Desktop, then prepare the existing local database without resetting it:

```sh
corepack pnpm exec supabase db start
corepack pnpm exec supabase migration up --local
corepack pnpm catalog:seed
```

Use `.env.example` as the configuration reference. Keep `DATABASE_URL` and the Crisp credentials
server-side. For the page's ordinary-language questions, explicitly set:

```dotenv
REPLYWORK_PROVIDER=crisp
REPLYWORK_RESPONDER=catalog-natural
REPLYWORK_CATALOG_MODEL=<your evaluated structured-output model ID>
GOOGLE_GENERATIVE_AI_API_KEY=<your server-side key>
CRISP_WEBSITE_ID=<test workspace UUID>
```

Natural mode sends the current question to Google's API; check its data terms, quota and billing.
For a model-free test, choose `REPLYWORK_RESPONDER=catalog` and type `/catalog canvas tote` into the
widget instead. An ordinary question in command-only mode deliberately hands off rather than
guessing. For a fixed transport check, choose `fixed` and set `REPLYWORK_REPLY_TEXT`.

Keep these processes in separate terminals, all started from the repository root:

| Process          | Command                     | Boundary                                     |
| ---------------- | --------------------------- | -------------------------------------------- |
| API              | `corepack pnpm dev:service` | Port 3000; signed webhook admission.         |
| Worker           | `corepack pnpm worker:run`  | Sequential processing; no HTTP port.         |
| Sample           | `corepack pnpm demo:crisp`  | Port 3001, localhost only.                   |
| Temporary tunnel | Command below               | Public HTTPS forwards to API port 3000 only. |

Run the tunnel command as **one line**, including the complete URL:

```sh
docker run --rm --name replywork-tunnel cloudflare/cloudflared:latest tunnel --no-autoupdate --url=http://host.docker.internal:3000
```

Copy the new `https://….trycloudflare.com` address from its output. Update the Crisp plugin's
**Development Web Hook** to that address followed by `/webhooks/crisp`. The sample's port 3001 and
PostgreSQL must not be exposed through the tunnel. Quick Tunnels are temporary development
endpoints, not a deployment or uptime commitment.

Open the sample and click **Open test chat**. Copy a sample question, paste it into the widget and
send it yourself. The page saying the widget is ready proves only widget loading; an actual reply
also needs the API, database, subscribed webhook and worker. Observe the conversation in Crisp's
operator Inbox.

The worker is deliberately opt-in. It drains one delivery at a time, waits one second after an idle
read and stops if processing fails. The existing queue retains failed work for a retry after its
configured visibility timeout. Correct the failure before restarting; no endless background
model/provider retry loop is hidden in the sample. `worker:once` remains available for a single
controlled attempt.

## Human takeover and returning automation

The sample's **Take over a conversation** section displays the current Crisp session ID after the
widget loads. Its buttons **copy commands only**; run them in a trusted terminal at the repository
root. These commands need database access, not a browser API or model key:

```sh
corepack pnpm conversation:control status <session-id>
corepack pnpm conversation:control pause <session-id>
corepack pnpm conversation:control resume <session-id>
```

In natural mode, **“Can I speak to a person?”** is intended to request handoff: Replywork saves the
pause and marks the Crisp conversation unresolved. It does not guarantee a customer-facing handoff
message, assign an operator or create a private note. Check the Inbox and stored control state.

For proactive manual takeover, stop the worker with Ctrl+C and let its active delivery finish, then
pause the session before replying in Crisp's Inbox. An HTTP send already started cannot be recalled.
Restart the worker if you want paused deliveries archived without automated replies.

Resume deliberately when automation should return, then send a **fresh, self-contained** customer
question. Previously admitted backlog is suppressed at the resume cutoff. Resolving a conversation
or sending an operator message does not itself resume automation. See
[conversation control limits](conversation-control.md).

## Stop and restart

1. Stop the worker with Ctrl+C; wait for its active delivery to finish and its connection to close.
2. Stop the API and sample with Ctrl+C. Close the sample browser tab.
3. Stop the tunnel with Ctrl+C; `--rm` removes that tunnel container, not your database.
4. If finished with local PostgreSQL, run `corepack pnpm exec supabase stop`. Do not use reset or
   data-removal options. Retaining the database preserves receipts, catalog and pause state.

You need these processes only when reproducing the live roundtrip. On a later run, start the
database and terminals again. A new Quick Tunnel has a new URL: update the development webhook
before sending another test message. Re-rendering the sample alone needs none of those processes.

## Troubleshooting

- **pnpm engine error:** use `corepack pnpm` from the repository root, not an older global pnpm.
- **Chat unavailable:** check the public workspace UUID, network/browser blocking and the page's
  loading message. Reload after a script-loading failure.
- **Widget works but no reply:** check the current tunnel URL, webhook path and `message:send`
  subscription; API and worker must both be running. Check session pause state and responder mode.
- **Worker stops:** its generic error intentionally omits credentials and customer text. Check
  configuration, local database and provider quota/connectivity; restart only after correcting the
  issue and allowing a failed delivery's visibility timeout to expire.
- **Command-only mode hands off:** use `/catalog canvas tote`, or explicitly configure natural mode.
- **No reply after takeover:** resume deliberately and send a new question; old backlog stays
  suppressed.

## Verification boundary

The retained page and polling loop have offline tests and browser checks with controlled widget
responses. The separately recorded live Crisp proof used a one-shot worker and an earlier local test
page. It verified the same backend transport and catalog path, not unattended operation of this new
page or loop. [Exact live evidence and limitations](crisp.md#verified-development-boundary).

References: [Crisp Web SDK](https://docs.crisp.chat/guides/chatbox-sdks/web-sdk/dollar-crisp/),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/),
[Docker host networking](https://docs.docker.com/desktop/features/networking/).
