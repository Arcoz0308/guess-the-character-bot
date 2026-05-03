import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionStatus } from "../../generated/prisma/enums";
import { findActiveSessionForGuild, formatGtcSessionStatus } from "../utils/gtc_helpers";
import { findVisibleSessionForGuild, formatPoints, formatUserName, leaderboardLimit, sendVisibleSessionAutocomplete } from "./points/helpers";

export const leaderboardCommand = createCommand({
  build: {
    slash: {
      name: "leaderboard",
      description: "Afficher le classement d'une session GTC",
      contexts: ["guild"],
      options: {
        session: {
          type: "string",
          description: "Session précédente à afficher",
          required: false,
          autocomplete: true,
        },
      } as const,
    },
  },
  autocomplete: ctx => sendVisibleSessionAutocomplete(ctx),
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const requestedSessionId = ctx.options.session ? Number.parseInt(ctx.options.session, 10) : undefined;
    const session = requestedSessionId
      ? await findVisibleSessionForGuild(requestedSessionId, guild.id)
      : await findActiveSessionForGuild(guild.id);

    if (!session) {
      return ctx.reply(requestedSessionId
        ? "Session introuvable pour ce serveur."
        : "Aucune session active n'est liée à ce serveur.", { ephemeral: true });
    }
    if (!requestedSessionId && session.status !== GtcSessionStatus.ACTIVE) {
      return ctx.reply("Aucune session active n'est liée à ce serveur.", { ephemeral: true });
    }

    const scores = await prisma.userScore.findMany({
      where: {
        sessionId: session.id,
        points: {
          gt: 0,
        },
      },
      include: {
        user: true,
      },
      orderBy: [
        {
          points: "desc",
        },
        {
          updatedAt: "asc",
        },
      ],
      take: leaderboardLimit,
    });

    if (scores.length === 0) {
      return ctx.reply(`Aucun point enregistré pour la session #${session.id} ${session.name}.`, { ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(session.status === GtcSessionStatus.ACTIVE ? 0x2ECC71 : 0x95A5A6)
      .setTitle(`Classement - #${session.id} ${session.name}`)
      .setDescription(scores.map((score, index) => {
        return `**${index + 1}.** <@${score.userId}> (${formatUserName(score.user)}) - ${formatPoints(score.points)}`;
      }).join("\n"))
      .addFields({
        name: "Session",
        value: formatGtcSessionStatus(session.status),
        inline: true,
      })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
