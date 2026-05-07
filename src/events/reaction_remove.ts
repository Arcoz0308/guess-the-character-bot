import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";
import { resolveOrganizerReactionRelay } from "./reaction_helpers";

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

    const emoji = reaction.emoji.identifier;
    if (!emoji) {
      return ctx.ok(true);
    }

    if (message.id !== originalMessage.id) {
      const originalGuild = await ctx.client.guilds.fetch(originalMessage.guildId);
      const originalChannel = originalGuild.channels.cache.get(originalMessage.channelId);
      if (originalChannel && originalChannel.type === ChannelType.GuildText) {
        const originalDiscordMessage = await originalChannel.messages.fetch(originalMessage.id);
        const originalReaction = originalDiscordMessage.reactions.cache.get(emoji) ?? await originalDiscordMessage.reactions.resolve(emoji)?.fetch();
        await originalReaction?.users.remove(ctx.client.user?.id).catch((error) => {
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
      const targetReaction = messageToUnreact.reactions.cache.get(emoji) ?? await messageToUnreact.reactions.resolve(emoji)?.fetch();
      await targetReaction?.users.remove(ctx.client.user?.id).catch((error) => {
        ctx.client.logger.warning(`Unable to remove relayed reaction ${emoji} from message ${targetDeliveredMessage.id} in guild ${targetDeliveredMessage.guildId}: ${formatReactionRemoveError(error)}`);
      });
    }

    return ctx.ok(true);
  },
});
