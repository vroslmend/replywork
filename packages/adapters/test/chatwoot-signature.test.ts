import { describe, expect, it } from "vitest";

import { signChatwootPayload, verifyChatwootSignature } from "@replywork/adapters";

const secret = "test-webhook-secret";
const timestamp = "1788948000";
const now = new Date("2026-09-09T10:00:00.000Z");
const rawBody = Buffer.from('{"event":"message_created","content":"hello"}');

describe("verifyChatwootSignature", () => {
  it("accepts a current signature over the original body", () => {
    const signature = signChatwootPayload(rawBody, timestamp, secret);

    expect(verifyChatwootSignature({ now, rawBody, secret, signature, timestamp })).toEqual({
      valid: true,
    });
  });

  it("rejects a modified body", () => {
    const signature = signChatwootPayload(rawBody, timestamp, secret);
    const modifiedBody = Buffer.from('{"event":"message_created", "content":"hello"}');

    expect(
      verifyChatwootSignature({ now, rawBody: modifiedBody, secret, signature, timestamp }),
    ).toEqual({ valid: false, reason: "invalid-signature" });
  });

  it("rejects stale and malformed timestamps", () => {
    const staleTimestamp = "1788947000";
    const staleSignature = signChatwootPayload(rawBody, staleTimestamp, secret);

    expect(
      verifyChatwootSignature({
        now,
        rawBody,
        secret,
        signature: staleSignature,
        timestamp: staleTimestamp,
      }),
    ).toEqual({ valid: false, reason: "stale-timestamp" });

    expect(
      verifyChatwootSignature({
        now,
        rawBody,
        secret,
        signature: "sha256=invalid",
        timestamp: "not-a-time",
      }),
    ).toEqual({ valid: false, reason: "invalid-timestamp" });
  });

  it("rejects missing headers", () => {
    expect(
      verifyChatwootSignature({ now, rawBody, secret, signature: undefined, timestamp }),
    ).toEqual({ valid: false, reason: "missing-signature" });

    expect(
      verifyChatwootSignature({
        now,
        rawBody,
        secret,
        signature: "sha256=invalid",
        timestamp: undefined,
      }),
    ).toEqual({ valid: false, reason: "missing-timestamp" });
  });
});
