import { describe, expect, it } from "vitest";

import { signCrispPayload, verifyCrispSignature } from "@replywork/adapters";

const secret = "development-token-key";
const timestamp = "1789297200000";
const now = new Date("2026-09-13T11:00:00.000Z");
const rawBody = Buffer.from('{"event":"message:send","content":"hello"}');

describe("verifyCrispSignature", () => {
  it("accepts a current signature over the original body", () => {
    const signature = signCrispPayload(rawBody, timestamp, secret);
    expect(verifyCrispSignature({ now, rawBody, secret, signature, timestamp })).toEqual({
      valid: true,
    });
  });

  it("accepts Crisp signatures with an optional sha256 prefix", () => {
    const signature = `sha256=${signCrispPayload(rawBody, timestamp, secret)}`;
    expect(verifyCrispSignature({ now, rawBody, secret, signature, timestamp })).toEqual({
      valid: true,
    });
  });

  it("rejects modified content, stale timestamps, and missing headers", () => {
    const signature = signCrispPayload(rawBody, timestamp, secret);
    expect(
      verifyCrispSignature({
        now,
        rawBody: Buffer.from(rawBody.toString("utf8").replace("hello", "changed")),
        secret,
        signature,
        timestamp,
      }),
    ).toEqual({ valid: false, reason: "invalid-signature" });
    expect(
      verifyCrispSignature({
        now,
        rawBody,
        secret,
        signature: signCrispPayload(rawBody, "1789296000000", secret),
        timestamp: "1789296000000",
      }),
    ).toEqual({ valid: false, reason: "stale-timestamp" });
    expect(verifyCrispSignature({ now, rawBody, secret, signature: undefined, timestamp })).toEqual(
      { valid: false, reason: "missing-signature" },
    );
  });
});
