import type { Guild } from "discord.js";
import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { AuditLogEvent, ChannelType } from "discord.js";
import { DeletionTarget } from "../../generated/prisma/enums";
import { canSendManagedSessionMessage, upsertDiscordUser } from "../utils/gtc_helpers";

const auditLogWindowMs = 10_000;

async function findMessageDeleteExecutorId(params: {
  authorId: string;
  channelId: string;
  deletedAt: number;
  guild: Guild;
  logWarning: (message: string) => void;
}) {
  try {
    const auditLogs = await params.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 6,
    });

    const entry = auditLogs.entries.find((auditEntry) => {
      if (!auditEntry.executorId) {
        return false;
      }
      if (auditEntry.targetId !== params.authorId) {
        return false;
      }
      if (Math.abs(params.deletedAt - auditEntry.createdTimestamp) > auditLogWindowMs) {
        return false;
      }

      return auditEntry.extra?.channel.id === params.channelId;
    });

    return entry?.executorId ?? null;
  }
  catch (error) {
    params.logWarning(`Unable to read message deletion audit logs in guild ${params.guild.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export const messageDeleteEvent = createEvent({
  event: "messageDelete",
  name: "message_delete",
  run: async (ctx, message) => {
    if (!message.guild) {
      return ctx.ok(true);
    }

    const originalMessage = await prisma.originalMessage.findUnique({
      where: {
        id: message.id,
      },
      include: {
        deliveredMessages: true,
        session: true,
        sourceGuild: true,
      },
    });

    if (!originalMessage?.session) {
      return ctx.ok(true);
    }
    if (originalMessage.guildId !== originalMessage.session.organizerGuildId) {
      return ctx.ok(true);
    }
    if (message.guild.id !== originalMessage.session.organizerGuildId) {
      return ctx.ok(true);
    }
    if (!originalMessage.sourceGuild.allowOrganizerDeletion) {
      ctx.client.logger.debug(`Ignored organizer message deletion ${originalMessage.id}: organizer deletion relay is disabled.`);
      return ctx.ok(true);
    }
    if (!originalMessage.sessionId) {
      return ctx.ok(true);
    }

    const deletedAt = Date.now();
    const auditExecutorId = await findMessageDeleteExecutorId({
      authorId: originalMessage.authorId,
      channelId: originalMessage.channelId,
      deletedAt,
      guild: message.guild,
      logWarning: message => ctx.client.logger.warning(message),
    });
    const fallbackAuthorCanManage = await canSendManagedSessionMessage(originalMessage.sessionId, originalMessage.authorId);
    const executorId = auditExecutorId ?? (fallbackAuthorCanManage ? originalMessage.authorId : null);

    if (!executorId) {
      ctx.client.logger.debug(`Ignored organizer message deletion ${originalMessage.id}: no session manager executor found.`);
      return ctx.ok(true);
    }
    if (!(await canSendManagedSessionMessage(originalMessage.sessionId, executorId))) {
      ctx.client.logger.debug(`Ignored organizer message deletion ${originalMessage.id}: executor ${executorId} is not a session manager.`);
      return ctx.ok(true);
    }

    const executor = await ctx.client.users.fetch(executorId);
    await upsertDiscordUser(executor);

    let deletedDeliveredCount = 0;
    let failedDeliveredCount = 0;

    for (const deliveredMessage of originalMessage.deliveredMessages) {
      try {
        const guild = await ctx.client.guilds.fetch(deliveredMessage.guildId);
        const channel = await guild.channels.fetch(deliveredMessage.channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          failedDeliveredCount++;
          continue;
        }

        await channel.messages.delete(deliveredMessage.id);
        await prisma.deliveredMessage.update({
          where: {
            id: deliveredMessage.id,
          },
          data: {
            deletedAt: new Date(),
          },
        });
        deletedDeliveredCount++;
      }
      catch (error) {
        ctx.client.logger.warning(`Failed to delete relayed message ${deliveredMessage.id} in guild ${deliveredMessage.guildId}: ${error instanceof Error ? error.message : String(error)}`);
        failedDeliveredCount++;
      }
    }

    await prisma.originalMessage.update({
      where: {
        id: originalMessage.id,
      },
      data: {
        deletedAt: new Date(deletedAt),
      },
    });

    await prisma.messageDeletion.create({
      data: {
        target: DeletionTarget.ALL_RELAYED,
        requestedFromGuildId: message.guild.id,
        requestedById: executorId,
        originalMessageId: originalMessage.id,
        deletedOriginal: true,
        deletedDeliveredCount,
        failedDeliveredCount,
        reason: "Suppression depuis le serveur organisateur",
      },
    });

    ctx.client.logger.info(`Propagated organizer deletion for message ${originalMessage.id}: ${deletedDeliveredCount} relayed deleted, ${failedDeliveredCount} failed.`);

    return ctx.ok(true);
  },
});
