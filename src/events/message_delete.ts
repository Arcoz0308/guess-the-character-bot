import type { ArcClient } from "arcscord";
import type { Guild } from "discord.js";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "#/prisma/prisma";
import { createEvent } from "arcscord";
import { AuditLogEvent, ChannelType } from "discord.js";
import { DeletionTarget, GtcSessionManagerRole } from "../../generated/prisma/enums";
import { canSendManagedSessionMessage, upsertDiscordUser } from "../utils/gtc_helpers";

const auditLogWindowMs = 10_000;
const auditLogLimit = 6;
const propagatedDeletionMessageIds = new Set<string>();

const originalMessageInclude = {
  deliveredMessages: true,
  session: true,
  sourceGuild: true,
} satisfies Prisma.OriginalMessageInclude;

const deliveredMessageInclude = {
  originalMessage: {
    include: originalMessageInclude,
  },
} satisfies Prisma.DeliveredMessageInclude;

type OriginalMessageWithRelay = Prisma.OriginalMessageGetPayload<{ include: typeof originalMessageInclude }>;
type DeliveredMessageWithOriginal = Prisma.DeliveredMessageGetPayload<{ include: typeof deliveredMessageInclude }>;
interface MessageDeleteAuditResult {
  candidatesCount: number;
  executorId: string | null;
}

interface RelayDeletionTarget {
  deliveredMessage: DeliveredMessageWithOriginal | null;
  originalMessage: OriginalMessageWithRelay;
}

interface DeleteStats {
  deletedDeliveredCount: number;
  deletedOriginal: boolean;
  failedDeliveredCount: number;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function findRelayDeletionTarget(messageId: string): Promise<RelayDeletionTarget | null> {
  const originalMessage = await prisma.originalMessage.findUnique({
    where: {
      id: messageId,
    },
    include: originalMessageInclude,
  });

  if (originalMessage) {
    return {
      deliveredMessage: null,
      originalMessage,
    };
  }

  const deliveredMessage = await prisma.deliveredMessage.findUnique({
    where: {
      id: messageId,
    },
    include: deliveredMessageInclude,
  });

  if (!deliveredMessage) {
    return null;
  }

  return {
    deliveredMessage,
    originalMessage: deliveredMessage.originalMessage,
  };
}

async function findMessageDeleteExecutorId(params: {
  channelId: string;
  deletedAt: number;
  guild: Guild;
  logWarning: (message: string) => void;
  sessionId: number;
  targetIds: string[];
}): Promise<MessageDeleteAuditResult> {
  try {
    const auditLogs = await params.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: auditLogLimit,
    });

    const candidates = [...auditLogs.entries.values()].filter((auditEntry) => {
      return auditEntry.executorId
        && Math.abs(params.deletedAt - auditEntry.createdTimestamp) <= auditLogWindowMs
        && auditEntry.extra?.channel.id === params.channelId;
    });

    const preferredCandidates = [
      ...candidates.filter(auditEntry => auditEntry.targetId && params.targetIds.includes(auditEntry.targetId)),
      ...candidates.filter(auditEntry => !auditEntry.targetId || !params.targetIds.includes(auditEntry.targetId)),
    ];

    for (const auditEntry of preferredCandidates) {
      if (auditEntry.executorId && await canSendManagedSessionMessage(params.sessionId, auditEntry.executorId)) {
        return {
          candidatesCount: candidates.length,
          executorId: auditEntry.executorId,
        };
      }
    }

    return {
      candidatesCount: candidates.length,
      executorId: null,
    };
  }
  catch (error) {
    params.logWarning(`Unable to read message deletion audit logs in guild ${params.guild.id}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      candidatesCount: 0,
      executorId: null,
    };
  }
}

async function findOrganizerFallbackExecutorId(sessionId: number, organizerGuildId: string) {
  const manager = await prisma.gtcSessionManager.findFirst({
    where: {
      sessionId,
      guildId: organizerGuildId,
      role: {
        in: [GtcSessionManagerRole.ADMIN, GtcSessionManagerRole.ORGANIZER],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return manager?.userId ?? null;
}

async function resolveDeletionExecutorId(params: {
  deletedAt: number;
  deliveredMessage: DeliveredMessageWithOriginal | null;
  guild: Guild;
  botUserId: string | null;
  messageAuthorId: string | null;
  messageChannelId: string;
  originalMessage: OriginalMessageWithRelay;
  logWarning: (message: string) => void;
}) {
  const { deliveredMessage, originalMessage } = params;
  const sessionId = originalMessage.sessionId;

  if (!sessionId || !originalMessage.session) {
    return null;
  }

  const auditResult = await findMessageDeleteExecutorId({
    channelId: params.messageChannelId,
    deletedAt: params.deletedAt,
    guild: params.guild,
    logWarning: params.logWarning,
    sessionId,
    targetIds: deliveredMessage
      ? uniqueValues([params.messageAuthorId, params.botUserId])
      : uniqueValues([originalMessage.authorId, params.messageAuthorId]),
  });

  if (auditResult.executorId) {
    return auditResult.executorId;
  }

  if (!deliveredMessage && await canSendManagedSessionMessage(sessionId, originalMessage.authorId)) {
    return originalMessage.authorId;
  }

  if (
    deliveredMessage
    && auditResult.candidatesCount === 0
    && params.guild.id === originalMessage.session.organizerGuildId
  ) {
    return findOrganizerFallbackExecutorId(sessionId, originalMessage.session.organizerGuildId);
  }

  return null;
}

async function deleteDiscordMessage(params: {
  client: ArcClient;
  id: string;
  guildId: string;
  channelId: string;
}) {
  const guild = await params.client.guilds.fetch(params.guildId);
  const channel = await guild.channels.fetch(params.channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    return false;
  }

  propagatedDeletionMessageIds.add(params.id);

  try {
    await channel.messages.delete(params.id);
    return true;
  }
  catch (error) {
    propagatedDeletionMessageIds.delete(params.id);
    throw error;
  }
}

async function deleteOriginalIfNeeded(params: {
  client: ArcClient;
  originalMessage: OriginalMessageWithRelay;
  triggeredByOriginal: boolean;
  logWarning: (message: string) => void;
}) {
  if (params.triggeredByOriginal) {
    return true;
  }

  try {
    return await deleteDiscordMessage({
      channelId: params.originalMessage.channelId,
      client: params.client,
      guildId: params.originalMessage.guildId,
      id: params.originalMessage.id,
    });
  }
  catch (error) {
    params.logWarning(`Failed to delete original message ${params.originalMessage.id} in guild ${params.originalMessage.guildId}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function deleteDeliveredMessages(params: {
  client: ArcClient;
  deletedAt: Date;
  originalMessage: OriginalMessageWithRelay;
  triggeringMessageId: string;
  logWarning: (message: string) => void;
}) {
  let deletedDeliveredCount = 0;
  let failedDeliveredCount = 0;

  for (const deliveredMessage of params.originalMessage.deliveredMessages) {
    if (deliveredMessage.id === params.triggeringMessageId) {
      deletedDeliveredCount++;
      await markDeliveredMessageDeleted(deliveredMessage.id, params.deletedAt);
      continue;
    }

    try {
      const deleted = await deleteDiscordMessage({
        channelId: deliveredMessage.channelId,
        client: params.client,
        guildId: deliveredMessage.guildId,
        id: deliveredMessage.id,
      });

      if (!deleted) {
        failedDeliveredCount++;
        continue;
      }

      deletedDeliveredCount++;
      await markDeliveredMessageDeleted(deliveredMessage.id, new Date());
    }
    catch (error) {
      params.logWarning(`Failed to delete relayed message ${deliveredMessage.id} in guild ${deliveredMessage.guildId}: ${error instanceof Error ? error.message : String(error)}`);
      failedDeliveredCount++;
    }
  }

  return {
    deletedDeliveredCount,
    failedDeliveredCount,
  };
}

async function markDeliveredMessageDeleted(messageId: string, deletedAt: Date) {
  await prisma.deliveredMessage.update({
    where: {
      id: messageId,
    },
    data: {
      deletedAt,
    },
  });
}

async function markOriginalMessageDeleted(messageId: string, deletedAt: Date) {
  await prisma.originalMessage.update({
    where: {
      id: messageId,
    },
    data: {
      deletedAt,
    },
  });
}

async function createDeletionLog(params: {
  deletedAt: Date;
  deliveredMessageId: string | null;
  executorId: string;
  originalMessageId: string;
  requestedFromGuildId: string;
  stats: DeleteStats;
}) {
  await markOriginalMessageDeleted(params.originalMessageId, params.deletedAt);

  await prisma.messageDeletion.create({
    data: {
      target: DeletionTarget.ALL_RELAYED,
      requestedFromGuildId: params.requestedFromGuildId,
      requestedById: params.executorId,
      originalMessageId: params.originalMessageId,
      deliveredMessageId: params.deliveredMessageId,
      deletedOriginal: params.stats.deletedOriginal,
      deletedDeliveredCount: params.stats.deletedDeliveredCount,
      failedDeliveredCount: params.stats.failedDeliveredCount,
      reason: "Suppression demandée par un organisateur GTC",
    },
  });
}

export const messageDeleteEvent = createEvent({
  event: "messageDelete",
  name: "message_delete",
  run: async (ctx, message) => {
    if (!message.guild || propagatedDeletionMessageIds.delete(message.id)) {
      return ctx.ok(true);
    }

    const deletionTarget = await findRelayDeletionTarget(message.id);
    const originalMessage = deletionTarget?.originalMessage;

    if (!deletionTarget || !originalMessage?.session || !originalMessage.sessionId || !originalMessage.sourceGuild.allowOrganizerDeletion) {
      return ctx.ok(true);
    }

    const deletedAt = new Date();
    const executorId = await resolveDeletionExecutorId({
      deletedAt: deletedAt.getTime(),
      deliveredMessage: deletionTarget.deliveredMessage,
      guild: message.guild,
      botUserId: ctx.client.user?.id ?? null,
      logWarning: warning => ctx.client.logger.warning(warning),
      messageAuthorId: message.author?.id ?? null,
      messageChannelId: message.channelId,
      originalMessage,
    });

    if (!executorId || !(await canSendManagedSessionMessage(originalMessage.sessionId, executorId))) {
      return ctx.ok(true);
    }

    const executor = await ctx.client.users.fetch(executorId);
    await upsertDiscordUser(executor);

    const triggeredByOriginal = deletionTarget.deliveredMessage === null;
    const deletedOriginal = await deleteOriginalIfNeeded({
      client: ctx.client,
      logWarning: warning => ctx.client.logger.warning(warning),
      originalMessage,
      triggeredByOriginal,
    });
    const deliveredStats = await deleteDeliveredMessages({
      client: ctx.client,
      deletedAt,
      logWarning: warning => ctx.client.logger.warning(warning),
      originalMessage,
      triggeringMessageId: message.id,
    });

    await createDeletionLog({
      deletedAt,
      deliveredMessageId: deletionTarget.deliveredMessage?.id ?? null,
      executorId,
      originalMessageId: originalMessage.id,
      requestedFromGuildId: message.guild.id,
      stats: {
        deletedOriginal,
        ...deliveredStats,
      },
    });

    return ctx.ok(true);
  },
});
