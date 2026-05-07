import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";
import { fetchReactionFromMessage, reactionEmojiKey, resolveOrganizerReactionRelay } from "./reaction_helpers";

function formatReactionRemoveError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const reactionRemoveEvent = createEvent({
  event: "messageReactionRemove",
  name: "reactionRemove",
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

    const emoji = reactionEmojiKey(reaction);
    if (!emoji) {
      return ctx.ok(true);
    }
    const botUserId = ctx.client.user?.id;
    if (!botUserId) {
      ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji}: bot user is not ready.`);
      return ctx.ok(true);
    }

    if (message.id !== originalMessage.id) {
      const originalGuild = await ctx.client.guilds.fetch(originalMessage.guildId);
      const originalChannel = originalGuild.channels.cache.get(originalMessage.channelId);
      if (originalChannel && originalChannel.type === ChannelType.GuildText) {
        const originalDiscordMessage = await originalChannel.messages.fetch(originalMessage.id);
        const originalReaction = await fetchReactionFromMessage(originalDiscordMessage, reaction);
        if (!originalReaction) {
          ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji} from original message ${originalMessage.id}: reaction is not present.`);
        }
        await originalReaction?.users.remove(botUserId).catch((error) => {
          ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji} from original message ${originalMessage.id}: ${formatReactionRemoveError(error)}`);
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

      const messageToUnreact = await channel.messages.fetch(targetDeliveredMessage.id);
      const targetReaction = await fetchReactionFromMessage(messageToUnreact, reaction);
      if (!targetReaction) {
        ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji} from message ${targetDeliveredMessage.id} in guild ${targetDeliveredMessage.guildId}: reaction is not present.`);
      }
      await targetReaction?.users.remove(botUserId).catch((error) => {
        ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji} from message ${targetDeliveredMessage.id} in guild ${targetDeliveredMessage.guildId}: ${formatReactionRemoveError(error)}`);
      });
    }

    return ctx.ok(true);
  },
});
