import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function logAiInteraction(params: {
  customerId?: string;
  type: string;
  input: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue;
  model?: string;
}): Promise<void> {
  await prisma.aiInteraction.create({
    data: {
      customerId: params.customerId,
      type: params.type,
      input: params.input,
      output: sanitizeOutput(params.output),
      model: params.model,
    },
  });
}

function sanitizeOutput(output: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return output;
  }
  const copy = { ...output } as Record<string, unknown>;
  delete copy.body;
  delete copy.originalMessage;
  delete copy.aiResponse;
  return copy as Prisma.InputJsonValue;
}
