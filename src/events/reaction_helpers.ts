import { prisma } from "#/prisma/prisma";
import { GtcSessionMode } from "../../generated/prisma/enums";
import { findActiveSessionForGuild } from "../utils/gtc_helpers";

export async function resolveOrganizerReactionRelay(messageId: string, guildId: string) {
  const session = await findActiveSessionForGuild(guildId, GtcSessionMode.INTER_GUILD);
  if (!session || guildId !== session.organizerGuildId) {
    return null;
  }

  const deliveredMessage = await prisma.deliveredMessage.findUnique({
    where: {
      id: messageId,
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
      id: messageId,
    },
    include: {
      deliveredMessages: true,
    },
  });

  if (!originalMessage || originalMessage.sessionId !== session.id) {
    return null;
  }

  return originalMessage;
}
