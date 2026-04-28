import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";
import { GtcSessionMode } from "../../generated/prisma/enums";
import { findActiveSessionForGuild } from "../utils/gtc_helpers";

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

    const session = await findActiveSessionForGuild(message.guild.id, GtcSessionMode.INTER_GUILD);
    if (!session) {
      return ctx.ok(true);
    }

    const deliveredMessage = await prisma.deliveredMessage.findUnique({
      where: {
        id: message.id,
      },
      include: {
        originalMessage: {
          include: {
            deliveredMessages: true,
          },
        },
      },
    });

    const originalMessage = deliveredMessage?.originalMessage ?? await prisma.originalMessage.findUnique({
      where: {
        id: message.id,
      },
      include: {
        deliveredMessages: true,
      },
    });

    if (!originalMessage || originalMessage.sessionId !== session.id) {
      return ctx.ok(true);
    }

    if (message.id !== originalMessage.id) {
      const originalGuild = await ctx.client.guilds.fetch(originalMessage.guildId);
      const originalChannel = originalGuild.channels.cache.get(originalMessage.channelId);
      if (originalChannel && originalChannel.type === ChannelType.GuildText) {
        const originalDiscordMessage = await originalChannel.messages.fetch(originalMessage.id);
        await originalDiscordMessage.react(reaction.emoji);
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
      await messageToReact.react(reaction.emoji);
    }

    return ctx.ok(true);
  },
});
