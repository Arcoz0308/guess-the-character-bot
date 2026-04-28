import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { findVisibleSession, sendSessionAutocomplete } from "./helpers";

export const leaveCommand = createCommand({
  build: {
    name: "leave",
    description: "Faire quitter ce serveur d'une session GTC",
    options: {
      session: {
        type: "string",
        description: "Session à quitter",
        required: true,
        autocomplete: true,
      },
    } as const,
  },
  autocomplete: ctx => sendSessionAutocomplete(ctx),
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const sessionId = Number.parseInt(ctx.options.session, 10);
    if (!Number.isInteger(sessionId)) {
      return ctx.reply("La session sélectionnée est invalide.", { ephemeral: true });
    }

    const session = await findVisibleSession(sessionId, guild.id);
    if (!session) {
      return ctx.reply("Session introuvable pour ce serveur.", { ephemeral: true });
    }
    if (session.organizerGuildId === guild.id) {
      return ctx.reply("Le serveur organisateur ne peut pas quitter sa propre session.", { ephemeral: true });
    }

    const deleted = await prisma.gtcSessionGuild.deleteMany({
      where: {
        sessionId: session.id,
        guildId: guild.id,
      },
    });
    if (deleted.count === 0) {
      return ctx.reply("Ce serveur ne participe pas à cette session.", { ephemeral: true });
    }

    await prisma.gtcSessionManager.deleteMany({
      where: {
        sessionId: session.id,
        guildId: guild.id,
      },
    });

    return ctx.reply(`Le serveur **${guild.name}** a quitté la session **${session.name}**.`, { ephemeral: true });
  },
});
