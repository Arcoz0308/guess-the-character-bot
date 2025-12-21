import * as process from "node:process";
import { ArcClient } from "arcscord";
import { Partials } from "discord.js";
import handlers from "./_handlers";
import "dotenv/config";

const client = new ArcClient(process.env.TOKEN ?? "", {
  intents: ["MessageContent", "GuildMessages", "Guilds", "GuildMessageReactions", "GuildMembers", "DirectMessageReactions"],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.loadHandlers(handlers);

client.on("clientReady", async () => {
  client.logger.info("Ready !");
});

void client.login();
