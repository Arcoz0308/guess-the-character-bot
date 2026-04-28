import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { isSessionAdmin, sendSessionAutocomplete } from "../helpers";

export const removeCommand = createCommand({
  build: {
    name: "remove",
    description: "Retirer un serveur participant d'une session GTC",
    options: {
      session: {
        type: "string",
        description: "Session concernée",
        required: true,
        autocomplete: true,
      },
      serveur: {
        type: "string",
        description: "Serveur participant à retirer",
        required: true,
        autocomplete: true,
      },
    } as const,
  },
  autocomplete: async (ctx) => {
    if (ctx.fullFocus.name === "session") {
      return sendSessionAutocomplete(ctx, true);
    }

    const guildId = ctx.guildId;
    if (!guildId) {
      return ctx.sendChoices([]);
    }

    const sessionId = Number.parseInt(ctx.interaction.options.getString("session") ?? "", 10);
    if (!Number.isInteger(sessionId)) {
      return ctx.sendChoices([]);
    }

    const focus = ctx.focus.trim();
    const guilds = await prisma.gtcSessionGuild.findMany({
      where: {
        sessionId,
        session: {
          organizerGuildId: guildId,
        },
        guild: focus.length > 0
          ? {
              name: {
                contains: focus,
                mode: "insensitive",
              },
            }
          : undefined,
      },
      include: {
        guild: true,
      },
      orderBy: {
        joinedAt: "asc",
      },
      take: 25,
    });

    return ctx.sendChoices(guilds.map((sessionGuild) => {
      return {
        name: `${sessionGuild.guild.name} (${sessionGuild.guildId})`.slice(0, 100),
        value: sessionGuild.guildId,
      };
    }));
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const sessionId = Number.parseInt(ctx.options.session, 10);
    if (!Number.isInteger(sessionId)) {
      return ctx.reply("La session sélectionnée est invalide.", { ephemeral: true });
    }

    const session = await prisma.gtcSession.findUnique({
      where: {
        id: sessionId,
      },
    });
    if (!session || session.organizerGuildId !== guild.id) {
      return ctx.reply("Session introuvable depuis ce serveur organisateur.", { ephemeral: true });
    }
    if (!(await isSessionAdmin(session.id, ctx.user.id))) {
      return ctx.reply("Seul un admin de cette session peut retirer un serveur.", { ephemeral: true });
    }
    if (ctx.options.serveur === session.organizerGuildId) {
      return ctx.reply("Le serveur organisateur ne peut pas être retiré.", { ephemeral: true });
    }

    const sessionGuild = await prisma.gtcSessionGuild.findUnique({
      where: {
        sessionId_guildId: {
          sessionId: session.id,
          guildId: ctx.options.serveur,
        },
      },
      include: {
        guild: true,
      },
    });
    if (!sessionGuild) {
      return ctx.reply("Ce serveur ne participe pas à cette session.", { ephemeral: true });
    }

    await prisma.$transaction([
      prisma.gtcSessionGuild.delete({
        where: {
          id: sessionGuild.id,
        },
      }),
      prisma.gtcSessionManager.deleteMany({
        where: {
          sessionId: session.id,
          guildId: sessionGuild.guildId,
        },
      }),
    ]);

    return ctx.reply(`Le serveur **${sessionGuild.guild.name}** a été retiré de la session **${session.name}**.`, { ephemeral: true });
  },
});
