import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { PointAwardStatus } from "../../../generated/prisma/enums";
import { awardsHistoryLimit, canManageSessionPoints, findVisibleSessionForGuild, formatDate, formatPoints, formatUserName, sendVisibleSessionAutocomplete } from "./helpers";

export const historyCommand = createCommand({
  build: {
    name: "history",
    description: "Afficher l'historique des attributions de points",
    options: {
      session: {
        type: "string",
        description: "Session à consulter",
        required: false,
        autocomplete: true,
      },
      joueur: {
        type: "user",
        description: "Filtrer sur un joueur",
        required: false,
      },
    } as const,
  },
  autocomplete: ctx => sendVisibleSessionAutocomplete(ctx),
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const sessionId = ctx.options.session ? Number.parseInt(ctx.options.session, 10) : undefined;
    const session = sessionId
      ? await findVisibleSessionForGuild(sessionId, guild.id)
      : await prisma.gtcSession.findFirst({
        where: {
          status: "ACTIVE",
          OR: [
            {
              organizerGuildId: guild.id,
            },
            {
              guilds: {
                some: {
                  guildId: guild.id,
                },
              },
            },
          ],
        },
        orderBy: [
          {
            startedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });

    if (!session) {
      return ctx.reply("Session introuvable pour ce serveur.", { ephemeral: true });
    }
    if (!(await canManageSessionPoints(session.id, ctx.user.id))) {
      return ctx.reply("Seuls les administrateurs et organisateurs de cette session peuvent consulter l'historique des points.", { ephemeral: true });
    }

    const awards = await prisma.pointAward.findMany({
      where: {
        sessionId: session.id,
        awardedToId: ctx.options.joueur?.id,
      },
      include: {
        awardedBy: true,
        awardedTo: true,
        revokedBy: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: awardsHistoryLimit,
    });

    if (awards.length === 0) {
      return ctx.reply("Aucune attribution de points trouvée pour cette session.", { ephemeral: true });
    }

    return ctx.reply({
      content: [
        `**Historique des points - #${session.id} ${session.name}**`,
        ...awards.map((award) => {
          const status = award.status === PointAwardStatus.REVOKED
            ? `révoqué par ${award.revokedBy ? formatUserName(award.revokedBy) : "inconnu"}`
            : "actif";
          const reason = award.reason ? ` - ${award.reason}` : "";

          return `#${award.id} | ${formatPoints(award.points)} à <@${award.awardedToId}> par ${formatUserName(award.awardedBy)} | ${status} | ${formatDate(award.createdAt)}${reason}`;
        }),
      ].join("\n"),
      ephemeral: true,
    });
  },
});
