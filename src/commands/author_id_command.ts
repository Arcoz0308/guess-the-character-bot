import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";

export const author_idCommand = createCommand({
  build: {
    message: {
      name: "author-id",
    },
  },
  run: async (ctx) => {
    if (!ctx.targetMessage.webhookId) {
      return ctx.reply(ctx.targetMessage.author.id, { ephemeral: true });
    }

    const deliveredMessage = await prisma.deliveredMessage.findUnique({
      where: {
        id: ctx.targetMessage.id,
      },
      include: {
        originalMessage: true,
      },
    });

    if (!deliveredMessage) {
      return ctx.reply("Ce message webhook n'est pas lié à une session GTC.", { ephemeral: true });
    }

    return ctx.reply(deliveredMessage.originalMessage.authorId, { ephemeral: true });
  },
});
