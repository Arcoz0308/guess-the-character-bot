import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";
import { reactionEmojiLabel, resolveOrganizerReactionRelay } from "./reaction_helpers";

export const reactionAddEvent = createEvent({
  event: "messageReactionAdd",
  name: "reactionAdd",
  run: async (ctx, reaction, user, _details) => {
    if (user.bot) {
      return ctx.ok(true);
    }

    if (reaction.partial) {
      reaction = await reaction.fetch();
    }

    const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    if (!message.guild) {
      return ctx.ok(true);
    }

    const originalMessage = await resolveOrganizerReactionRelay(message.id, message.guild.id);
    if (!originalMessage) {
      return ctx.ok(true);
    }

    if (message.id !== originalMessage.id) {
      const originalGuild = await ctx.client.guilds.fetch(originalMessage.guildId);
      const originalChannel = originalGuild.channels.cache.get(originalMessage.channelId);
      if (originalChannel && originalChannel.type === ChannelType.GuildText) {
        const originalDiscordMessage = await originalChannel.messages.fetch(originalMessage.id);
        await originalDiscordMessage.react(reaction.emoji).catch((error) => {
          ctx.client.logger.warning(`Unable to relay reaction ${reactionEmojiLabel(reaction)} to original message ${originalMessage.id}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }

    for (const targetDeliveredMessage of originalMessage.deliveredMessages) {
      if (targetDeliveredMessage.id === message.id) {
        continue;
      }

      const guild = await ctx.client.guilds.fetch(targetDeliveredMessage.guildId);
      const channel = guild.channels.cache.get(targetDeliveredMessage.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        ctx.client.logger.error(`Channel is not a text channel in server ${targetDeliveredMessage.guildName}`);
        continue;
      }

      const messageToReact = await channel.messages.fetch(targetDeliveredMessage.id);
      await messageToReact.react(reaction.emoji).catch((error) => {
        ctx.client.logger.warning(`Unable to relay reaction ${reactionEmojiLabel(reaction)} to message ${targetDeliveredMessage.id} in guild ${targetDeliveredMessage.guildId}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    return ctx.ok(true);
  },
});
