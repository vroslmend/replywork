BEGIN;

CREATE TABLE replywork.conversation_automation (
  provider text NOT NULL CHECK (provider = 'chatwoot'),
  account_id text NOT NULL CHECK (length(btrim(account_id)) > 0),
  conversation_id text NOT NULL CHECK (length(btrim(conversation_id)) > 0),
  paused boolean NOT NULL,
  handoff jsonb CHECK (jsonb_typeof(handoff) = 'object'),
  resumed_at timestamp with time zone,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_id, conversation_id),
  CHECK (paused OR handoff IS NULL)
);

ALTER TABLE replywork.conversation_automation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON replywork.conversation_automation FROM PUBLIC;

COMMIT;
