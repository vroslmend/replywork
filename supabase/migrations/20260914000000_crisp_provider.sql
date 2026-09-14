BEGIN;

ALTER TABLE replywork.delivery_receipts
  DROP CONSTRAINT delivery_receipts_provider_check,
  ADD CONSTRAINT delivery_receipts_provider_check
    CHECK (provider IN ('chatwoot', 'crisp'));

ALTER TABLE replywork.conversation_automation
  DROP CONSTRAINT conversation_automation_provider_check,
  ADD CONSTRAINT conversation_automation_provider_check
    CHECK (provider IN ('chatwoot', 'crisp'));

COMMIT;
