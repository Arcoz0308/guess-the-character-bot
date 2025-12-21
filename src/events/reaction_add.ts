import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";

export const reactionAddEvent = createEvent({
  event: "messageReactionAdd",
  name: "reactionAdd",
  run: async (ctx, reaction, user, _details) => {
    if (user.bot) {
      return ctx.ok(true);
    }
    if (!reaction.message) {
      reaction = await reaction.fetch();
      if (!reaction.message) {
        return ctx.ok(true);
      }
    }
    if (!reaction.message.guild) {
      return ctx.ok(true);
    }

    if (!reaction.message.webhookId) {
      return ctx.ok(true);
    }

    const guildSettings = await prisma.guild.findUnique({
      where: {
        id: reaction.message.guild.id,
      },
    });

    if (!guildSettings) {
      return ctx.ok(true);
    }
    if (!guildSettings.organist) {
      return ctx.ok(true);
    }

    if (reaction.message.channel.id !== guildSettings.channelId) {
      return ctx.ok(true);
    }
    ctx.client.logger.info(reaction.emoji.toString());

    const messageInfos = await prisma.sendedMessage.findUnique({
      where: {
        id_guildId: {
          id: reaction.message.id,
          guildId: reaction.message.guild.id,
        },
      },
      include: {
        originalMessage: {
          include: {
            guild: true,
            sendedMessages: true
          },
        },
      }
    });

    if (!messageInfos) {
      return ctx.ok("Message not found");
    }

    // React to the original message first
    const origGuild = await ctx.client.guilds.fetch(messageInfos.originalMessage.guildId);
    if (origGuild) {
      const origChannel = origGuild.channels.cache.get(messageInfos.originalMessage.channelId);
      if (origChannel && origChannel.type === ChannelType.GuildText) {
        const origMsg = await origChannel.messages.fetch(messageInfos.originalMessage.id);
        if (origMsg) {
          await origMsg.react(reaction.emoji);
        }
      }
    }

    // React to all corresponding sended messages
    for (const sendedMessage of messageInfos.originalMessage.sendedMessages) {
      if (sendedMessage.bot) {
        continue;
      }
      const guild = await ctx.client.guilds.fetch(sendedMessage.guildId);
      if (!guild) {
        continue;
      }
      const channel = guild.channels.cache.get(sendedMessage.channelId);
      if (!channel) {
        continue;
      }
      if (channel.type !== ChannelType.GuildText) {
        ctx.client.logger.error(`Channel is not a text channel in server ${guild.name}`);
        continue;
      }

      const sendedMessageToReact = await channel.messages.fetch(sendedMessage.id);
      if (!sendedMessageToReact) {
        continue;
      }
      await sendedMessageToReact.react(reaction.emoji);
    }
    
    return ctx.ok(true);
  },
});
