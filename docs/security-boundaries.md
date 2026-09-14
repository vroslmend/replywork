# Security boundaries

## Webhooks

- Verify provider signatures using the provider's documented signing format.
- Reject missing, malformed, stale, or future timestamps outside the accepted window.
- Use constant-time comparison for signatures of equal length.
- Derive a stable delivery key from the provider's delivery or message identifier.
- Do not acknowledge work until its delivery has been admitted durably.

## Customer identity

A valid webhook proves that the configured provider sent the event. It does not prove that a person
in the conversation owns a customer account or order. Sensitive lookups require a separate identity
check appropriate to the connected business.

## Business actions

A model may classify a request, extract proposed fields, search approved information, or propose a
bounded action. Deterministic code must validate identity, prices, stock, transaction fields,
confirmation, approval, and retry safety before a write occurs.

## Data and logs

- Keep credentials in environment variables or a managed secret store.
- Never commit customer payloads or production data.
- Store only the data needed for processing, audit, and an agreed retention period.
- Redact personal data and credentials before sending traces to an external service.
- Keep the default test suite offline and use synthetic fixtures.
