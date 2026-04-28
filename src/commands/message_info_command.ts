import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { messageUrl } from "../utils/gtc_helpers";

function missingInfo() {
  return "indisponible";
}

export const message_infoCommand = createCommand({
  build: {
    message: {
      name: "message-info",
    },
  },
  run: async (ctx) => {
    const originalMessage = await prisma.originalMessage.findUnique({
      where: {
        id: ctx.targetMessage.id,
      },
      include: {
        author: true,
        session: true,
      },
    }) ?? (await prisma.deliveredMessage.findUnique({
      where: {
        id: ctx.targetMessage.id,
      },
      include: {
        originalMessage: {
          include: {
            author: true,
            session: true,
          },
        },
      },
    }))?.originalMessage;

    if (!originalMessage) {
      return ctx.reply("Ce message n'est pas lié à une session GTC.", { ephemeral: true });
    }

    return ctx.reply({
      content: [
        "**Information du message**",
        `Session: ${originalMessage.session?.name ?? originalMessage.sessionId ?? missingInfo()}`,
        `Serveur: ${originalMessage.guildName} (${originalMessage.guildId})`,
        `Salon: <#${originalMessage.channelId}>`,
        `Auteur: ${originalMessage.author.username} (${originalMessage.authorId})`,
        `Lien: ${messageUrl(originalMessage.guildId, originalMessage.channelId, originalMessage.id)}`,
      ].join("\n"),
      ephemeral: true,
    });
  },
});
