import { z } from "zod";

export const catalogItemSchema = z.object({
  available: z.boolean(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: z.string().trim().min(1).max(2_000),
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  priceMinor: z.number().int().min(0).max(2_147_483_647),
});

export const catalogQuerySchema = z.object({
  limit: z.number().int().min(1).max(20),
  text: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((text) => !text.includes("\0")),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// Flat output shape for provider structured generation; cross-field rules are checked locally.
export const catalogRequestSchema = z
  .strictObject({
    kind: z.enum(["search", "clarify", "handoff"]),
    query: catalogQuerySchema.shape.text.nullable(),
    topic: z.enum(["details", "price", "availability"]).nullable(),
  })
  .superRefine((request, context) => {
    const valid =
      request.kind === "search"
        ? request.query !== null && request.topic !== null
        : request.query === null && request.topic === null;
    if (!valid)
      context.addIssue({ code: "custom", message: "Only a search may contain a query and topic" });
  });

export type CatalogRequest = z.infer<typeof catalogRequestSchema>;
