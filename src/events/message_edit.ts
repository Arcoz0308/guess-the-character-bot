import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";

export const messageEditEvent = createEvent({
  event: "messageUpdate",
  name: "messageEdit",
  run: async (ctx, _, newMessage) => {
    if (newMessage.author.bot) {
      return ctx.ok(true);
    }
    if (!newMessage.guild) {
      return ctx.ok(true);
    }
    const guildSettings = await prisma.guild.findUnique({
      where: {
        id: newMessage.guild.id,
      },
    });

    if (!guildSettings) {
      return ctx.ok(true);
    }
    if (!guildSettings.organist) {
      return ctx.ok(true);
    }

    if (newMessage.channel.id !== guildSettings.channelId) {
      return ctx.ok(true);
    }

    const messageInfos = await prisma.originalMessage.findUnique({
      where: {
        id_channelId: {
          id: newMessage.id,
          channelId: newMessage.channel.id,
        },
      },
      include: {
        sendedMessages: {
          include: {
            guild: true,
          },
        },
      },
    });

    if (!messageInfos) {
      return ctx.ok("Message not found");
    }

    for (const sendedMessage of messageInfos.sendedMessages) {
      if (!sendedMessage.bot) {
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

      const sendedMessageToEdit = await channel.messages.fetch(sendedMessage.id);
      if (!sendedMessageToEdit) {
        continue;
      }
      await sendedMessageToEdit.edit(newMessage.content.replaceAll(guildSettings.pingRoleId, sendedMessage.guild.pingRoleId));
    }
    return ctx.ok(true);
  },
});
