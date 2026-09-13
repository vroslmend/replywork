import {
  catalogItemSchema,
  catalogQuerySchema,
  type CatalogItem,
  type ConversationEvent,
} from "@replywork/contracts";

import type {
  AuditStore,
  CatalogCapability,
  ConversationResponder,
  ResponseDecision,
} from "./ports.js";

export interface CatalogResponderDependencies {
  auditStore: AuditStore;
  catalog: CatalogCapability;
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

const formatItem = (item: CatalogItem): string => {
  const digits = currencyMinorUnits[item.currency];
  const price =
    digits === undefined
      ? `${item.currency} ${item.priceMinor} minor units`
      : `${item.currency} ${new Intl.NumberFormat("en", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }).format(item.priceMinor / 10 ** digits)}`;
  return `${item.name} (${item.id})\n${price}; listed as ${item.available ? "available" : "unavailable"}\n${item.description}`;
};

export class CatalogResponder implements ConversationResponder {
  constructor(private readonly dependencies: CatalogResponderDependencies) {}

  async decide(event: ConversationEvent): Promise<ResponseDecision> {
    const command = /^\/catalog(?:\s+([\s\S]*))?$/i.exec(event.message.text.trim());
    if (command === null) {
      return {
        context: { capability: "catalog" },
        kind: "handoff",
        reason: "This request is outside the catalog lookup.",
      };
    }

    const parsed = catalogQuerySchema.safeParse({ limit: 5, text: command[1] ?? "" });
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
      text =
        items.length === 0
          ? "I couldn't find a product matching that search. Try another product name or ID."
          : `Catalog matches:\n\n${items.map(formatItem).join("\n\n")}`;
    } catch (error) {
      await this.dependencies.auditStore.append({
        at: (this.dependencies.now?.() ?? new Date()).toISOString(),
        deliveryKey: event.deliveryKey,
        details: { capability: "catalog", operation: "search" },
        kind: "tool",
        outcome: "failed",
      });
      throw error;
    }

    await this.dependencies.auditStore.append({
      at: (this.dependencies.now?.() ?? new Date()).toISOString(),
      deliveryKey: event.deliveryKey,
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
}
