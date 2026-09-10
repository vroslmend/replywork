BEGIN;

CREATE EXTENSION IF NOT EXISTS pgmq;

CREATE SCHEMA IF NOT EXISTS replywork;
REVOKE ALL ON SCHEMA replywork FROM PUBLIC;

SELECT pgmq.create('conversation_events');

CREATE TABLE replywork.delivery_receipts (
  delivery_key text PRIMARY KEY CHECK (length(btrim(delivery_key)) > 0),
  provider text NOT NULL CHECK (provider = 'chatwoot'),
  account_id text NOT NULL CHECK (length(btrim(account_id)) > 0),
  inbox_id text NOT NULL CHECK (length(btrim(inbox_id)) > 0),
  conversation_id text NOT NULL CHECK (length(btrim(conversation_id)) > 0),
  message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
  occurred_at timestamp with time zone NOT NULL,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (provider, account_id, message_id)
);

CREATE TABLE replywork.audit_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_key text NOT NULL REFERENCES replywork.delivery_receipts (delivery_key),
  kind text NOT NULL CHECK (kind IN ('delivery', 'handoff', 'reply', 'tool')),
  outcome text NOT NULL CHECK (outcome IN ('failed', 'ignored', 'succeeded')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX audit_entries_delivery_history_idx
  ON replywork.audit_entries (delivery_key, created_at, id);

COMMIT;
