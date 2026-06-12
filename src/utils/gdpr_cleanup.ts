import type { PrismaClient } from "../../generated/prisma/client";
import * as process from "node:process";

export interface GdprCleanupResult {
  cutoff: Date;
  deletedOriginalMessages: number;
}

const DEFAULT_MESSAGE_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_HOUR = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCleanupHour(value: string | undefined) {
  const parsed = parsePositiveInteger(value, DEFAULT_CLEANUP_HOUR);
  return Math.min(parsed, 23);
}

export function getMessageRetentionDays() {
  return parsePositiveInteger(process.env.GDPR_MESSAGE_RETENTION_DAYS, DEFAULT_MESSAGE_RETENTION_DAYS);
}

export function getGdprCleanupHour() {
  return parseCleanupHour(process.env.GDPR_CLEANUP_HOUR);
}

export function getMessageRetentionCutoff(now = new Date(), retentionDays = getMessageRetentionDays()) {
  return new Date(now.getTime() - retentionDays * MS_PER_DAY);
}

export async function cleanupExpiredMessageRecords(
  prisma: PrismaClient,
  now = new Date(),
  retentionDays = getMessageRetentionDays(),
): Promise<GdprCleanupResult> {
  const cutoff = getMessageRetentionCutoff(now, retentionDays);

  const deletedOriginalMessages = await prisma.originalMessage.deleteMany({
    where: {
      sentAt: {
        lt: cutoff,
      },
    },
  });

  return {
    cutoff,
    deletedOriginalMessages: deletedOriginalMessages.count,
  };
}

export function getNextDailyRun(from = new Date(), hour = getGdprCleanupHour()) {
  const nextRun = new Date(from);
  nextRun.setHours(hour, 0, 0, 0);

  if (nextRun <= from) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun;
}
