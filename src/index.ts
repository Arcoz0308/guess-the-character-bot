import * as process from "node:process";
import { ArcClient } from "arcscord";
import { Partials } from "discord.js";
import handlers from "./_handlers";
import { prisma } from "./prisma/prisma";
import { cleanupExpiredMessageRecords, getGdprCleanupHour, getMessageRetentionDays, getNextDailyRun } from "./utils/gdpr_cleanup";
import "dotenv/config";

if (!process.env.TOKEN) {
  throw new Error("Missing TOKEN environment variable.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

const client = new ArcClient(process.env.TOKEN ?? "", {
  intents: ["MessageContent", "GuildMessages", "Guilds", "GuildMessageReactions", "DirectMessageReactions"],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.logger.info(`Starting GTC bot in ${process.env.NODE_ENV ?? "development"} mode.`);

void client.loadHandlers(handlers, true);

function scheduleGdprCleanup() {
  const runAtHour = getGdprCleanupHour();
  const retentionDays = getMessageRetentionDays();
  let timeout: NodeJS.Timeout | undefined;

  const scheduleNextRun = () => {
    const nextRun = getNextDailyRun(new Date(), runAtHour);
    const delay = nextRun.getTime() - Date.now();

    client.logger.info(`Next GDPR cleanup scheduled at ${nextRun.toISOString()} (${retentionDays} day message retention).`);
    timeout = setTimeout(async () => {
      try {
        const result = await cleanupExpiredMessageRecords(prisma, new Date(), retentionDays);
        client.logger.info(`GDPR cleanup deleted ${result.deletedOriginalMessages} original message record(s) before ${result.cutoff.toISOString()}.`);
      }
      catch (error) {
        client.logger.error(`GDPR cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      finally {
        scheduleNextRun();
      }
    }, delay);
  };

  scheduleNextRun();
  return () => {
    if (timeout) {
      clearTimeout(timeout);
    }
  };
}

scheduleGdprCleanup();

client.on("clientReady", async () => {
  client.logger.info(`Ready as ${client.user?.tag ?? "unknown bot"} on ${client.guilds.cache.size} guild(s).`);
});

client.on("error", (error) => {
  client.logger.error(`Discord client error: ${error.message}`);
});

void client.login();
