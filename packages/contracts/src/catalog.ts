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
