import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { ChannelType } from "discord.js";
import { GtcSessionMode, MessageDeliveryKind } from "../../generated/prisma/enums";
import {
  botRelayAllowedMentions,
  canSendManagedSessionMessage,
  findActiveSessionForGuild,
  getSessionGuildConfig,
  translatePingRole,
} from "../utils/gtc_helpers";

export const messageEditEvent = createEvent({
  event: "messageUpdate",
  name: "messageEdit",
  run: async (ctx, _, newMessage) => {
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;

    if (message.author?.bot) {
      return ctx.ok(true);
    }
    if (!message.guild) {
      return ctx.ok(true);
    }
    if (!message.content) {
      return ctx.ok(true);
    }

    const session = await findActiveSessionForGuild(message.guild.id, GtcSessionMode.INTER_GUILD);
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
    if (session.organizerGuildId !== message.guild.id) {
      const warning = await message.reply("Les modifications de messages depuis un serveur participant ne sont pas relayées.");
      setTimeout(() => {
        void warning.delete().catch(() => undefined);
      }, 5 * 60 * 1000);

      return ctx.ok(true);
    }

    const originalMessage = await prisma.originalMessage.findUnique({
      where: {
        id: message.id,
      },
      include: {
        deliveredMessages: {
          include: {
            targetGuild: true,
          },
        },
      },
    });

    if (!originalMessage || originalMessage.sessionId !== session.id) {
      return ctx.ok(true);
    }

    const canUseManagedRelay = await canSendManagedSessionMessage(session.id, originalMessage.authorId);
    if (!canUseManagedRelay) {
      return ctx.ok(true);
    }

    await prisma.originalMessage.update({
      where: {
        id: message.id,
      },
      data: {
        editedAt: message.editedAt ?? new Date(),
      },
    });

    for (const deliveredMessage of originalMessage.deliveredMessages) {
      if (deliveredMessage.deliveryKind !== MessageDeliveryKind.BOT) {
        continue;
      }

      const content = translatePingRole(message.content, sourceGuildConfig, deliveredMessage.targetGuild);

      const guild = await ctx.client.guilds.fetch(deliveredMessage.guildId);
      const channel = guild.channels.cache.get(deliveredMessage.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        ctx.client.logger.error(`Channel is not a text channel in server ${deliveredMessage.targetGuild.name}`);
        continue;
      }

      const messageToEdit = await channel.messages.fetch(deliveredMessage.id);
      await messageToEdit.edit({
        allowedMentions: botRelayAllowedMentions(deliveredMessage.targetGuild),
        content,
      });
    }

    return ctx.ok(true);
  },
});
