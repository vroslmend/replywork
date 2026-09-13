import { parseArgs } from "node:util";

import {
  CatalogResponder,
  type AuditEntry,
  type CatalogCapability,
  type CatalogInterpreter,
} from "@replywork/core";
import { z } from "zod";

const questionSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((text) => !text.includes("\0"));

export const parseCatalogQuestionArguments = (args: readonly string[]) => {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    strict: true,
    options: { run: { type: "boolean", default: false } },
  });
  if (positionals.length !== 1) throw new Error("Provide one quoted catalog question");
  return { run: values.run, question: questionSchema.parse(positionals[0]) };
};

export const answerCatalogQuestion = async (
  input: string,
  dependencies: { catalog: CatalogCapability; interpreter: CatalogInterpreter },
) => {
  const question = questionSchema.parse(input);
  const audit: AuditEntry[] = [];
  const responder = new CatalogResponder({
    ...dependencies,
    auditStore: {
      append: async (entry) => {
        audit.push(entry);
      },
    },
  });
  const decision = await responder.decideQuestion(question, "local:catalog-question");
  return { decision, audit };
};
