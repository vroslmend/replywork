import type { ConversationProvider, RequestHandoffInput, SendReplyInput } from "@replywork/core";
import { z } from "zod";

const messageSchema = z
  .object({
    source_id: z.string().nullable().optional(),
  })
  .loose();

const messageListSchema = z
  .object({
    payload: z.array(messageSchema),
  })
  .loose();

type Fetch = typeof fetch;

export interface ChatwootConversationProviderOptions {
  accountId: number;
  accessToken: string;
  baseUrl: string;
  fetch?: Fetch;
  handoffTeamId?: number;
  timeoutMilliseconds?: number;
}

export class ChatwootApiError extends Error {
  readonly operation: string;
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`Chatwoot ${operation} failed with status ${status}`);
    this.name = "ChatwootApiError";
    this.operation = operation;
    this.status = status;
  }
}

export class ChatwootConversationProvider implements ConversationProvider {
  readonly #accountId: number;
  readonly #accessToken: string;
  readonly #baseUrl: URL;
  readonly #fetch: Fetch;
  readonly #handoffTeamId: number | undefined;
  readonly #timeoutMilliseconds: number;

  constructor(options: ChatwootConversationProviderOptions) {
    if (!Number.isInteger(options.accountId) || options.accountId <= 0) {
      throw new RangeError("Chatwoot account ID must be a positive integer");
    }
    if (options.accessToken.length === 0) {
      throw new RangeError("Chatwoot access token must not be empty");
    }
    if (
      options.handoffTeamId !== undefined &&
      (!Number.isInteger(options.handoffTeamId) || options.handoffTeamId <= 0)
    ) {
      throw new RangeError("Chatwoot handoff team ID must be a positive integer");
    }

    const baseUrl = new URL(options.baseUrl);
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
      throw new TypeError("Chatwoot base URL must use HTTP or HTTPS");
    }

    const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
    if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0) {
      throw new RangeError("Chatwoot timeout must be a positive integer");
    }

    this.#accountId = options.accountId;
    this.#accessToken = options.accessToken;
    this.#baseUrl = new URL(baseUrl.toString().replace(/\/*$/, "/"));
    this.#fetch = options.fetch ?? fetch;
    this.#handoffTeamId = options.handoffTeamId;
    this.#timeoutMilliseconds = timeoutMilliseconds;
  }

  async sendReply(input: SendReplyInput): Promise<void> {
    if (await this.#messageExists(input.conversationId, input.idempotencyKey)) {
      return;
    }

    await this.#request("send reply", this.#messagesPath(input.conversationId), {
      content: input.text,
      content_type: "text",
      message_type: "outgoing",
      private: false,
      source_id: input.idempotencyKey,
    });
  }

  async requestHandoff(input: RequestHandoffInput): Promise<void> {
    const noteSourceId = `${input.idempotencyKey}:note`;
    if (!(await this.#messageExists(input.conversationId, noteSourceId))) {
      await this.#request("record handoff", this.#messagesPath(input.conversationId), {
        content: `Replywork requested a human handoff.\n\nReason: ${input.reason}`,
        content_attributes: {
          replywork: {
            context: input.context,
            reason: input.reason,
          },
        },
        content_type: "text",
        message_type: "outgoing",
        private: true,
        source_id: noteSourceId,
      });
    }

    if (this.#handoffTeamId !== undefined) {
      await this.#request(
        "assign handoff",
        this.#conversationPath(input.conversationId, "assignments"),
        {
          team_id: this.#handoffTeamId,
        },
      );
    }

    await this.#request(
      "open handoff",
      this.#conversationPath(input.conversationId, "toggle_status"),
      {
        status: "open",
      },
    );
  }

  async #messageExists(conversationId: string, sourceId: string): Promise<boolean> {
    const response = await this.#request(
      "list messages",
      this.#messagesPath(conversationId),
      undefined,
      "GET",
    );
    const parsed = messageListSchema.safeParse(response);
    if (!parsed.success) {
      throw new TypeError("Chatwoot list messages returned an invalid response");
    }

    return parsed.data.payload.some((message) => message.source_id === sourceId);
  }

  #messagesPath(conversationId: string): string {
    return this.#conversationPath(conversationId, "messages");
  }

  #conversationPath(conversationId: string, suffix: string): string {
    return `api/v1/accounts/${this.#accountId}/conversations/${encodeURIComponent(conversationId)}/${suffix}`;
  }

  async #request(
    operation: string,
    path: string,
    body?: Readonly<Record<string, unknown>>,
    method = "POST",
  ): Promise<unknown> {
    const response = await this.#fetch(new URL(path, this.#baseUrl), {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        api_access_token: this.#accessToken,
      },
      method,
      signal: AbortSignal.timeout(this.#timeoutMilliseconds),
    });

    if (!response.ok) {
      throw new ChatwootApiError(operation, response.status);
    }

    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  }
}
