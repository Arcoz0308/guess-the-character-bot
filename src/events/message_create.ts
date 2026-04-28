import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType, WebhookClient } from "discord.js";
import { GtcSessionMode, MessageDeliveryKind } from "../../generated/prisma/enums";
import {
  canSendManagedSessionMessage,
  discordGuildName,
  findActiveSessionForGuild,
  getRelayTargetGuilds,
  getSessionGuildConfig,
  relayAllowedMentions,
  translatePingRole,
  upsertDiscordUser,
} from "../utils/gtc_helpers";

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

    const session = await findActiveSessionForGuild(message.guild.id);
    if (!session) {
      return ctx.ok(true);
    }

    const sourceGuildConfig = getSessionGuildConfig(session, message.guild.id);
    if (!sourceGuildConfig?.channelId) {
      return ctx.ok(true);
    }
    if (message.channel.id !== sourceGuildConfig.channelId) {
      return ctx.ok(true);
    }

    await upsertDiscordUser(message.author);
    await prisma.gtcParticipation.upsert({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: message.author.id,
        },
      },
      update: {
        guildId: message.guild.id,
      },
      create: {
        sessionId: session.id,
        userId: message.author.id,
        guildId: message.guild.id,
      },
    });

    if (session.mode !== GtcSessionMode.INTER_GUILD) {
      return ctx.ok(true);
    }
    if (!sourceGuildConfig.relayMessages) {
      return ctx.ok(true);
    }

    const isOrganizerGuildMessage = session.organizerGuildId === message.guild.id;
    const useBotRelay = isOrganizerGuildMessage && await canSendManagedSessionMessage(session.id, message.author.id);

    await prisma.originalMessage.create({
      data: {
        id: message.id,
        sessionId: session.id,
        guildId: message.guild.id,
        guildName: discordGuildName(message.guild),
        channelId: message.channel.id,
        authorId: message.author.id,
        content: message.content,
        attachments: message.attachments.map(attachment => ({
          contentType: attachment.contentType,
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          url: attachment.url,
        })),
        embeds: JSON.parse(JSON.stringify({
          items: message.embeds.map(embed => embed.toJSON()),
        })),
        sentAt: message.createdAt,
      },
    });

    for (const targetGuildConfig of getRelayTargetGuilds(session, message.guild.id)) {
      const content = useBotRelay
        ? translatePingRole(message.content, sourceGuildConfig, targetGuildConfig)
        : message.content;

      if (!useBotRelay) {
        if (!targetGuildConfig.webhookUrl) {
          ctx.client.logger.warning(`No webhook configured for relay target ${targetGuildConfig.name}`);
          continue;
        }

        const webhookClient = new WebhookClient({ url: targetGuildConfig.webhookUrl });
        const deliveredMessage = await webhookClient.send({
          allowedMentions: relayAllowedMentions(targetGuildConfig),
          avatarURL: message.author.avatarURL() || undefined,
          content,
          username: message.author.username,
        });

        await prisma.deliveredMessage.create({
          data: {
            id: deliveredMessage.id,
            originalMessageId: message.id,
            guildId: targetGuildConfig.id,
            guildName: targetGuildConfig.name,
            channelId: targetGuildConfig.channelId!,
            deliveryKind: MessageDeliveryKind.WEBHOOK,
            sentAt: new Date(),
          },
        });
        continue;
      }

      const discordGuild = await ctx.client.guilds.fetch(targetGuildConfig.id);
      const channel = discordGuild.channels.cache.get(targetGuildConfig.channelId!);
      if (!channel || channel.type !== ChannelType.GuildText) {
        ctx.client.logger.error(`Channel is not a text channel in server ${targetGuildConfig.name}`);
        continue;
      }

      const deliveredMessage = await channel.send({
        allowedMentions: relayAllowedMentions(targetGuildConfig),
        content,
      });
      await prisma.deliveredMessage.create({
        data: {
          id: deliveredMessage.id,
          originalMessageId: message.id,
          guildId: targetGuildConfig.id,
          guildName: targetGuildConfig.name,
          channelId: channel.id,
          deliveryKind: MessageDeliveryKind.BOT,
          sentAt: deliveredMessage.createdAt,
        },
      });
    }

    return ctx.ok(true);
  },
});
