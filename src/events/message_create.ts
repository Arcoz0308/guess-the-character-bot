import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType, WebhookClient } from "discord.js";

export const messageCreateEvent = createEvent({
  event: "messageCreate",
  name: "messageCreate",
  run: async (ctx, message) => {
    if (message.author.bot) {
      return ctx.ok(true);
    }

    if (message.content === "") {
      return ctx.ok(true);
    }
    if (!message.guild) {
      return ctx.ok(true);
    }

    const guildSettings = await prisma.guild.findUnique({
      where: {
        id: message.guild.id,
      },
    });

    if (!guildSettings) {
      return ctx.ok(true);
    }

    if (message.channel.id !== guildSettings.channelId) {
      return ctx.ok(true);
    }

    // send message to alls channels
    if (guildSettings.organist) {
      await prisma.originalMessage.create({
        data: {
          id: message.id,
          channelId: message.channel.id,
          content: message.content,
          guildId: message.guild.id,
        },
      });
      const guilds = await prisma.guild.findMany({
        where: {
          sendMessages: true,
        },
      });
      for (const guild of guilds) {
        // don't send message in same guild that the message was sent
        if (guild.id === message.guild.id) {
          continue;
        }

        const discordGuild = await ctx.client.guilds.fetch(guild.id);
        if (!discordGuild) {
          continue;
        }
        const channel = discordGuild.channels.cache.get(guild.channelId);
        if (!channel) {
          continue;
        }
        if (channel.type !== ChannelType.GuildText) {
          ctx.client.logger.error(`Channel is not a text channel in server ${guild.name}`);
          continue;
        }
        const sendedMessage = await channel.send(message.content.replaceAll(guildSettings.pingRoleId, guild.pingRoleId));
        await prisma.sendedMessage.create({
          data: {
            id: sendedMessage.id,
            guildId: guild.id,
            channelId: channel.id,
            originalMessageId: message.id,
            originalMessageChannelId: message.channel.id,
            bot: true,
          },
        });
      }
      return ctx.ok(true);
    }
    await prisma.originalMessage.create({
      data: {
        id: message.id,
        channelId: message.channel.id,
        content: message.content,
        guildId: message.guild.id,
      },
    });
    // send message to alls channels with webhook
    const guilds = await prisma.guild.findMany({
      where: {
        sendMessages: true,
      },
    });
    for (const guild of guilds) {
      // don't send message in same guild that the message was sent
      if (guild.id === message.guild.id) {
        continue;
      }

      if (guild.sendMessages === false) {
        continue;
      }
      if (guild.webhookUrl === "") {
        ctx.client.logger.error(`Webhook url is empty in server ${guild.name}`);
        continue;
      }

      const webhookClient = new WebhookClient({ url: guild.webhookUrl });
      const sendedMessage = await webhookClient.send({
        content: message.content,
        avatarURL: message.author.avatarURL() || undefined,
        username: message.author.username,
        allowedMentions: { parse: ["users"] },
      });
      await prisma.sendedMessage.create({
        data: {
          id: sendedMessage.id,
          guildId: guild.id,
          channelId: guild.channelId,
          originalMessageId: message.id,
          originalMessageChannelId: message.channel.id,
          bot: false,
        },
      });
    }
    return ctx.ok(true);
  },
});
