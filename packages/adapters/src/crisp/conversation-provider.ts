import { createHash } from "node:crypto";

import type { ConversationProvider, RequestHandoffInput, SendReplyInput } from "@replywork/core";
import { z } from "zod";

type Fetch = typeof fetch;
const messageResponseSchema = z
  .object({
    data: z.object({ fingerprint: z.number().int() }).loose(),
    error: z.literal(false),
  })
  .loose();

export interface CrispConversationProviderOptions {
  apiBaseUrl?: string;
  fetch?: Fetch;
  timeoutMilliseconds?: number;
  tokenIdentifier: string;
  tokenKey: string;
  websiteId: string;
}

export class CrispApiError extends Error {
  readonly operation: string;
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`Crisp ${operation} failed with status ${status}`);
    this.name = "CrispApiError";
    this.operation = operation;
    this.status = status;
  }
}

export class CrispConversationProvider implements ConversationProvider {
  readonly #authorization: string;
  readonly #baseUrl: URL;
  readonly #fetch: Fetch;
  readonly #timeoutMilliseconds: number;
  readonly #websiteId: string;

  constructor(options: CrispConversationProviderOptions) {
    if (options.websiteId.trim().length === 0)
      throw new RangeError("Crisp website ID must not be empty");
    if (options.tokenIdentifier.length === 0 || options.tokenKey.length === 0) {
      throw new RangeError("Crisp plugin credentials must not be empty");
    }
    const baseUrl = new URL(options.apiBaseUrl ?? "https://api.crisp.chat");
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
      throw new TypeError("Crisp API base URL must use HTTP or HTTPS");
    }
    const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
    if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
      throw new RangeError("Crisp timeout must be a positive integer");
    }

    this.#authorization = `Basic ${Buffer.from(`${options.tokenIdentifier}:${options.tokenKey}`).toString("base64")}`;
    this.#baseUrl = new URL(baseUrl.toString().replace(/\/*$/, "/"));
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMilliseconds = timeoutMilliseconds;
    this.#websiteId = options.websiteId;
  }

  async sendReply(input: SendReplyInput): Promise<void> {
    const fingerprint = fingerprintFor(input.idempotencyKey);
    if (await this.#messageExists(input.conversationId, fingerprint)) return;
    await this.#request("send reply", this.#messagePath(input.conversationId), {
      automated: true,
      content: input.text,
      fingerprint,
      from: "operator",
      origin: "chat",
      type: "text",
    });
  }

  async requestHandoff(input: RequestHandoffInput): Promise<void> {
    await this.#request(
      "open handoff",
      `${this.#conversationPath(input.conversationId)}/state`,
      {
        state: "unresolved",
      },
      "PATCH",
    );
  }

  async #messageExists(conversationId: string, fingerprint: number): Promise<boolean> {
    const response = await this.#fetch(
      new URL(`${this.#messagePath(conversationId)}/${fingerprint}`, this.#baseUrl),
      {
        headers: this.#headers(false),
        method: "GET",
        signal: AbortSignal.timeout(this.#timeoutMilliseconds),
      },
    );
    if (response.status === 404) return false;
    if (!response.ok) throw new CrispApiError("find reply", response.status);
    const parsed = messageResponseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.data.fingerprint !== fingerprint) {
      throw new TypeError("Crisp find reply returned an invalid response");
    }
    return true;
  }

  #conversationPath(conversationId: string): string {
    return `v1/website/${encodeURIComponent(this.#websiteId)}/conversation/${encodeURIComponent(conversationId)}`;
  }

  #messagePath(conversationId: string): string {
    return `${this.#conversationPath(conversationId)}/message`;
  }

  #headers(hasBody: boolean): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: this.#authorization,
      "X-Crisp-Tier": "plugin",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    };
  }

  async #request(
    operation: string,
    path: string,
    body: Readonly<Record<string, unknown>>,
    method = "POST",
  ): Promise<void> {
    const response = await this.#fetch(new URL(path, this.#baseUrl), {
      body: JSON.stringify(body),
      headers: this.#headers(true),
      method,
      signal: AbortSignal.timeout(this.#timeoutMilliseconds),
    });
    if (!response.ok) throw new CrispApiError(operation, response.status);
  }
}

export const fingerprintFor = (idempotencyKey: string): number =>
  Number.parseInt(createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12), 16);
