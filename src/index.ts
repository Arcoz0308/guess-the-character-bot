import * as process from "node:process";
import { ArcClient } from "arcscord";
import { Partials } from "discord.js";
import handlers from "./_handlers";
import "dotenv/config";

if (!process.env.TOKEN) {
  throw new Error("Missing TOKEN environment variable.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

const client = new ArcClient(process.env.TOKEN ?? "", {
  intents: ["MessageContent", "GuildMessages", "Guilds", "GuildMessageReactions", "GuildMembers", "DirectMessageReactions"],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.logger.info(`Starting GTC bot in ${process.env.NODE_ENV ?? "development"} mode.`);

void client.loadHandlers(handlers, true);

client.on("clientReady", async () => {
  client.logger.info(`Ready as ${client.user?.tag ?? "unknown bot"} on ${client.guilds.cache.size} guild(s).`);
});

client.on("error", (error) => {
  client.logger.error(`Discord client error: ${error.message}`);
});

process.on("unhandledRejection", (reason) => {
  client.logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});

process.on("uncaughtException", (error) => {
  client.logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
});

void client.login();
