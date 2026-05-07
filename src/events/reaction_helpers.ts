import type { Message, MessageReaction, PartialMessageReaction } from "discord.js";
import { prisma } from "#/prisma/prisma";
import { GtcSessionMode } from "../../generated/prisma/enums";
import { findActiveSessionForGuild } from "../utils/gtc_helpers";

export function reactionEmojiKey(reaction: MessageReaction | PartialMessageReaction) {
  return reaction.emoji.id ?? reaction.emoji.name;
}

export function reactionEmojiLabel(reaction: MessageReaction | PartialMessageReaction) {
  return reaction.emoji.identifier ?? reaction.emoji.name ?? "unknown";
}

export async function fetchReactionFromMessage(message: Message, reaction: MessageReaction | PartialMessageReaction) {
  const key = reactionEmojiKey(reaction);
  if (!key) {
    return null;
  }

  return message.reactions.cache.get(key) ?? await message.reactions.resolve(key)?.fetch() ?? null;
}

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
