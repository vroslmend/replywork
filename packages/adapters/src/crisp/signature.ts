import { createHmac, timingSafeEqual } from "node:crypto";

export type CrispSignatureFailure =
  | "invalid-signature"
  | "invalid-timestamp"
  | "missing-signature"
  | "missing-timestamp"
  | "stale-timestamp";

export type CrispSignatureVerification =
  { valid: false; reason: CrispSignatureFailure } | { valid: true };

export interface VerifyCrispSignatureInput {
  maxAgeSeconds?: number;
  now?: Date;
  rawBody: Buffer;
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
}

const timestampPattern = /^\d{1,16}$/;

export const signCrispPayload = (rawBody: Buffer, timestamp: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(`[${timestamp};${JSON.stringify(JSON.parse(rawBody.toString("utf8")) as unknown)}]`)
    .digest("hex");

export const verifyCrispSignature = (
  input: VerifyCrispSignatureInput,
): CrispSignatureVerification => {
  if (input.signature === undefined || input.signature.length === 0) {
    return { valid: false, reason: "missing-signature" };
  }
  if (input.timestamp === undefined || input.timestamp.length === 0) {
    return { valid: false, reason: "missing-timestamp" };
  }
  if (!timestampPattern.test(input.timestamp)) {
    return { valid: false, reason: "invalid-timestamp" };
  }

  const timestampValue = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampValue)) {
    return { valid: false, reason: "invalid-timestamp" };
  }
  const signedAtMilliseconds =
    timestampValue < 1_000_000_000_000 ? timestampValue * 1000 : timestampValue;
  const maxAgeMilliseconds = (input.maxAgeSeconds ?? 300) * 1000;
  if (Math.abs((input.now ?? new Date()).getTime() - signedAtMilliseconds) > maxAgeMilliseconds) {
    return { valid: false, reason: "stale-timestamp" };
  }

  const receivedValue = input.signature.startsWith("sha256=")
    ? input.signature.slice("sha256=".length)
    : input.signature;
  if (!/^[a-f\d]{64}$/i.test(receivedValue)) {
    return { valid: false, reason: "invalid-signature" };
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(signCrispPayload(input.rawBody, input.timestamp, input.secret), "hex");
  } catch {
    return { valid: false, reason: "invalid-signature" };
  }
  const received = Buffer.from(receivedValue, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: "invalid-signature" };
  }
  return { valid: true };
};
