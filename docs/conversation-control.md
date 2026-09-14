# Conversation control

Handoff pauses Replywork automation until a trusted operator resumes the conversation. The inbox
provider still owns the operator inbox; Replywork stores only the automation state and pending
handoff intent in `replywork.conversation_automation`.

## Operator commands

Apply the repository migrations to the existing database, without resetting it:

```sh
pnpm exec supabase migration up --local
```

Set `DATABASE_URL`, `REPLYWORK_PROVIDER`, and the matching account scope (`CHATWOOT_ACCOUNT_ID` or
`CRISP_WEBSITE_ID`) in the root `.env` or terminal environment. These commands need database access,
not an inbox-provider API token. Run from the repository root, replacing `19` with the provider's
conversation or session ID:

```sh
pnpm conversation:control status 19
pnpm conversation:control pause 19
pnpm conversation:control resume 19
```

Each command prints the scoped ID, pause state and change/resume timestamps, then closes its
connection. Status is read-only. A conversation without a stored control record is active. Check the
account and conversation IDs before changing state; the command does not verify their existence in
the provider. Anyone with these database credentials is trusted to change the controls. The
timestamp is current-state tracking, not an authenticated operator audit history.

## Processing behavior

Handoff saves the pause and original reason/context before asking the provider to surface the
conversation. If that request fails, the delivery remains queued. Its retry uses the saved handoff
intent without another responder decision. Later deliveries do not search the catalog or write to
the provider; the worker records an ignored outcome and archives them.

Manual pause blocks automated replies without requesting a provider handoff. It does not erase an
existing pending handoff. Resume clears that intent and records a database timestamp. Deliveries
admitted at or before that cutoff are ignored, including failed handoff retries and unread backlog.
Only newly admitted deliveries can produce another decision. Provider message timestamps do not
control this boundary. Late redeliveries with an existing receipt retain their original admission
time; previously unseen delayed events are new admissions.

There is no automatic resume when the provider resolves or reopens a conversation, and no pause
expiry. Customer messages cannot invoke the operator commands. Paused state survives worker and PC
restarts as long as the database is retained. Deleting/resetting the database loses that state.

## Limits

Outgoing operator messages are filtered at admission, so proactive human takeover is not detected
automatically. Pause before replying manually and resume deliberately when automation should return.

The worker checks state before a decision and again before sending a reply, but cannot recall an
HTTP request already started. Run one controlled worker; concurrent workers and simultaneous
operator/provider writes are not an atomic cancellation boundary. Stop or wait for an active worker
invocation to finish before relying on a manual pause for exclusive takeover.

The default fixed responder does not choose handoff; manual controls still apply. Catalog mode hands
off requests outside `/catalog`; natural catalog mode uses its interpreter's handoff decision.
Paused messages do not invoke either responder or model. Database tests verify stored state, retry
suppression, scope isolation, resume cutoffs and the queue/provider-request boundary. Live provider
compatibility and an unattended customer interface remain unverified.
