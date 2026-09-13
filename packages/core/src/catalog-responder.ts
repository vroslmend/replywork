import {
  catalogItemSchema,
  catalogQuerySchema,
  catalogRequestSchema,
  type CatalogItem,
  type ConversationEvent,
} from "@replywork/contracts";

import type {
  AuditStore,
  CatalogCapability,
  CatalogInterpreter,
  ConversationResponder,
  ResponseDecision,
} from "./ports.js";

export interface CatalogResponderDependencies {
  auditStore: AuditStore;
  catalog: CatalogCapability;
  interpreter?: CatalogInterpreter;
  now?: () => Date;
}

// ISO 4217 minor units, not locale-specific currency display precision.
// https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html
const currencyMinorUnits: Readonly<Record<string, number>> = {
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
  PKR: 2,
  USD: 2,
};

const formatPrice = (item: CatalogItem): string => {
  const digits = currencyMinorUnits[item.currency];
  return digits === undefined
    ? `${item.currency} ${item.priceMinor} minor units`
    : `${item.currency} ${new Intl.NumberFormat("en", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(item.priceMinor / 10 ** digits)}`;
};

const formatItem = (item: CatalogItem): string =>
  `${item.name} (${item.id})\n${formatPrice(item)}; listed as ${item.available ? "available" : "unavailable"}\n${item.description}`;

const normalizeMention = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

export class CatalogResponder implements ConversationResponder {
  constructor(private readonly dependencies: CatalogResponderDependencies) {}

  async decide(event: ConversationEvent): Promise<ResponseDecision> {
    return this.decideQuestion(event.message.text, event.deliveryKey);
  }

  async decideQuestion(question: string, deliveryKey: string): Promise<ResponseDecision> {
    const command = /^\/catalog(?:\s+([\s\S]*))?$/i.exec(question.trim());
    let queryText = command?.[1] ?? "";
    let topic: "details" | "price" | "availability" = "details";
    if (command === null) {
      if (this.dependencies.interpreter === undefined) return this.handoff();
      if (question.trim().length === 0 || question.length > 2_000 || question.includes("\0")) {
        return this.clarify();
      }
      let request;
      try {
        request = catalogRequestSchema.parse(
          await this.dependencies.interpreter.interpret(question),
        );
      } catch (error) {
        await this.dependencies.auditStore.append({
          at: (this.dependencies.now?.() ?? new Date()).toISOString(),
          deliveryKey,
          details: { capability: "catalog", operation: "interpret" },
          kind: "tool",
          outcome: "failed",
        });
        throw error;
      }
      const queryMentioned =
        request.query === null
          ? null
          : normalizeMention(question).includes(normalizeMention(request.query));
      await this.dependencies.auditStore.append({
        at: (this.dependencies.now?.() ?? new Date()).toISOString(),
        deliveryKey,
        details: {
          capability: "catalog",
          operation: "interpret",
          decision: request.kind,
          topic: request.topic,
          queryMentioned,
        },
        kind: "tool",
        outcome: "succeeded",
      });
      if (request.kind === "handoff") return this.handoff();
      if (request.kind === "clarify") return this.clarify();
      // The request schema enforces these fields for search decisions.
      queryText = request.query!;
      topic = request.topic!;
      if (!queryMentioned) {
        return this.clarify();
      }
    }

    const parsed = catalogQuerySchema.safeParse({ limit: 5, text: queryText });
    if (!parsed.success) {
      return {
        kind: "reply",
        text: "Send /catalog followed by a product name or ID (up to 200 characters).",
      };
    }

    let items: CatalogItem[];
    let text: string;
    try {
      items = catalogItemSchema
        .array()
        .max(parsed.data.limit)
        .parse(await this.dependencies.catalog.searchCatalog(parsed.data));
      if (items.length === 0) {
        text = "I couldn't find a product matching that search. Try another product name or ID.";
      } else if (topic !== "details" && items.length > 1) {
        text = `Which product did you mean? Send its name or ID.\n\n${items.map((item) => `${item.name} (${item.id})`).join("\n")}`;
      } else if (topic === "price") {
        const item = items[0]!;
        text = `${item.name} (${item.id})\nRecorded price: ${formatPrice(item)}. This does not include a checkout calculation.`;
      } else if (topic === "availability") {
        const item = items[0]!;
        text = `${item.name} (${item.id})\nListed as ${item.available ? "available" : "unavailable"} in the catalog. This is not a stock reservation.`;
      } else {
        text = `Catalog matches:\n\n${items.map(formatItem).join("\n\n")}`;
      }
    } catch (error) {
      await this.dependencies.auditStore.append({
        at: (this.dependencies.now?.() ?? new Date()).toISOString(),
        deliveryKey,
        details: { capability: "catalog", operation: "search" },
        kind: "tool",
        outcome: "failed",
      });
      throw error;
    }

    await this.dependencies.auditStore.append({
      at: (this.dependencies.now?.() ?? new Date()).toISOString(),
      deliveryKey,
      details: {
        capability: "catalog",
        operation: "search",
        productIds: items.map((item) => item.id),
        resultCount: items.length,
      },
      kind: "tool",
      outcome: "succeeded",
    });
    return { kind: "reply", text };
  }

  private clarify(): ResponseDecision {
    return {
      kind: "reply",
      text: "Which product are you asking about? Send its name or ID and what you'd like to know.",
    };
  }

  private handoff(): ResponseDecision {
    return {
      kind: "handoff",
      context: { capability: "catalog" },
      reason: "This request is outside the catalog lookup.",
    };
  }
}
