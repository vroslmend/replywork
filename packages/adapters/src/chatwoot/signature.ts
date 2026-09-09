import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureFailure =
  | "invalid-signature"
  | "invalid-timestamp"
  | "missing-signature"
  | "missing-timestamp"
  | "stale-timestamp";

export type SignatureVerification = { valid: false; reason: SignatureFailure } | { valid: true };

export interface VerifyChatwootSignatureInput {
  maxAgeSeconds?: number;
  now?: Date;
  rawBody: Buffer;
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
}

const timestampPattern = /^\d{1,12}$/;

export const signChatwootPayload = (rawBody: Buffer, timestamp: string, secret: string): string =>
  `sha256=${createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`;

export const verifyChatwootSignature = (
  input: VerifyChatwootSignatureInput,
): SignatureVerification => {
  if (input.signature === undefined || input.signature.length === 0) {
    return { valid: false, reason: "missing-signature" };
  }

  if (input.timestamp === undefined || input.timestamp.length === 0) {
    return { valid: false, reason: "missing-timestamp" };
  }

  if (!timestampPattern.test(input.timestamp)) {
    return { valid: false, reason: "invalid-timestamp" };
  }

  const signedAtSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(signedAtSeconds)) {
    return { valid: false, reason: "invalid-timestamp" };
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const maxAgeSeconds = input.maxAgeSeconds ?? 300;
  if (Math.abs(nowSeconds - signedAtSeconds) > maxAgeSeconds) {
    return { valid: false, reason: "stale-timestamp" };
  }

  const expected = Buffer.from(
    signChatwootPayload(input.rawBody, input.timestamp, input.secret),
    "utf8",
  );
  const received = Buffer.from(input.signature, "utf8");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: "invalid-signature" };
  }

  return { valid: true };
};
