import { prisma } from "../lib/prisma.js";

const MARKETING_PAUSED_KEY = "marketing_paused";

export async function isMarketingPausedGlobally(): Promise<boolean> {
  const row = await prisma.systemSetting.findUnique({ where: { key: MARKETING_PAUSED_KEY } });
  return Boolean(row?.value && (row.value as { paused?: boolean }).paused);
}

export async function setMarketingPaused(paused: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: MARKETING_PAUSED_KEY },
    create: { key: MARKETING_PAUSED_KEY, value: { paused } },
    update: { value: { paused } },
  });
}
