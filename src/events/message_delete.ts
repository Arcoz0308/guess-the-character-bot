import type { Guild } from "discord.js";
import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { AuditLogEvent, ChannelType } from "discord.js";
import { DeletionTarget } from "../../generated/prisma/enums";
import { canSendManagedSessionMessage, upsertDiscordUser } from "../utils/gtc_helpers";

const auditLogWindowMs = 10_000;

async function findMessageDeleteExecutorId(params: {
  channelId: string;
  deletedAt: number;
  guild: Guild;
  logWarning: (message: string) => void;
  targetIds: string[];
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
      if (params.targetIds.length > 0 && (!auditEntry.targetId || !params.targetIds.includes(auditEntry.targetId))) {
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

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export const messageDeleteEvent = createEvent({
  event: "messageDelete",
  name: "message_delete",
  run: async (ctx, message) => {
    if (!message.guild) {
      return ctx.ok(true);
    }

    const directOriginalMessage = await prisma.originalMessage.findUnique({
      where: {
        id: message.id,
      },
      include: {
        deliveredMessages: true,
        session: true,
        sourceGuild: true,
      },
    });

    const deliveredMessage = directOriginalMessage
      ? null
      : await prisma.deliveredMessage.findUnique({
        where: {
          id: message.id,
        },
        include: {
          originalMessage: {
            include: {
              deliveredMessages: true,
              session: true,
              sourceGuild: true,
            },
          },
        },
      });
    const originalMessage = directOriginalMessage ?? deliveredMessage?.originalMessage;

    if (!originalMessage?.session) {
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
      channelId: message.channelId,
      deletedAt,
      guild: message.guild,
      logWarning: message => ctx.client.logger.warning(message),
      targetIds: directOriginalMessage
        ? uniqueValues([originalMessage.authorId, message.author?.id])
        : uniqueValues([message.author?.id, ctx.client.user?.id]),
    });
    const fallbackAuthorCanManage = directOriginalMessage ? await canSendManagedSessionMessage(originalMessage.sessionId, originalMessage.authorId) : false;
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
    let deletedOriginal = directOriginalMessage !== null;

    if (!directOriginalMessage) {
      try {
        const guild = await ctx.client.guilds.fetch(originalMessage.guildId);
        const channel = await guild.channels.fetch(originalMessage.channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          failedDeliveredCount++;
        }
        else {
          await channel.messages.delete(originalMessage.id);
          deletedOriginal = true;
        }
      }
      catch (error) {
        ctx.client.logger.warning(`Failed to delete original message ${originalMessage.id} in guild ${originalMessage.guildId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const deliveredMessage of originalMessage.deliveredMessages) {
      if (deliveredMessage.id === message.id) {
        deletedDeliveredCount++;
        await prisma.deliveredMessage.update({
          where: {
            id: deliveredMessage.id,
          },
          data: {
            deletedAt: new Date(deletedAt),
          },
        });
        continue;
      }

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
        deliveredMessageId: deliveredMessage?.id,
        deletedOriginal,
        deletedDeliveredCount,
        failedDeliveredCount,
        reason: "Suppression demandée par un organisateur GTC",
      },
    });

    ctx.client.logger.info(`Propagated organizer deletion for message ${originalMessage.id}: original deleted=${deletedOriginal}, ${deletedDeliveredCount} relayed deleted, ${failedDeliveredCount} failed.`);

    return ctx.ok(true);
  },
});
