import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../../generated/prisma/enums";
import { formatGtcSessionStatus } from "../../utils/gtc_helpers";

const sessionsLimit = 25;
const embedDescriptionLimit = 3900;

function formatShortSessionMode(mode: GtcSessionMode) {
  if (mode === GtcSessionMode.INTER_GUILD) {
    return "Interserveur";
  }

  return "Serveur seul";
}

function sessionColor(status: GtcSessionStatus) {
  switch (status) {
    case GtcSessionStatus.ACTIVE:
      return 0x2ECC71;
    case GtcSessionStatus.CANCELLED:
      return 0xE74C3C;
    case GtcSessionStatus.ENDED:
      return 0x95A5A6;
    case GtcSessionStatus.PLANNED:
      return 0x3498DB;
  }
}

function formatSessionLines(lines: string[]) {
  const displayedLines: string[] = [];
  let length = 0;

  for (const line of lines) {
    const separatorLength = displayedLines.length > 0 ? 2 : 0;
    if (length + separatorLength + line.length > embedDescriptionLimit) {
      break;
    }

    displayedLines.push(line);
    length += separatorLength + line.length;
  }

  return displayedLines.join("\n\n");
}

export const listCommand = createCommand({
  build: {
    name: "list",
    description: "Lister les sessions GTC accessibles depuis ce serveur",
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const where = {
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
    };

    const [sessions, totalSessions] = await prisma.$transaction([
      prisma.gtcSession.findMany({
        where,
        include: {
          organizerGuild: true,
          _count: {
            select: {
              participations: true,
              pointAwards: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
        take: sessionsLimit,
      }),
      prisma.gtcSession.count({
        where,
      }),
    ]);

    if (sessions.length === 0) {
      return ctx.reply("Aucune session GTC n'est liée à ce serveur.", { ephemeral: true });
    }

    const activeSession = sessions.find(session => session.status === GtcSessionStatus.ACTIVE);
    const lines = sessions.map((session) => {
      return [
        `**#${session.id} - ${session.name}**`,
        `${formatGtcSessionStatus(session.status)} | ${formatShortSessionMode(session.mode)} | ${session.organizerGuild.name}`,
        `Participants: ${session._count.participations} | Points attribués: ${session._count.pointAwards}`,
      ].join("\n");
    });

    const embed = new EmbedBuilder()
      .setColor(activeSession ? sessionColor(activeSession.status) : 0x3498DB)
      .setTitle("Sessions GTC")
      .setDescription(formatSessionLines(lines))
      .addFields(
        {
          name: "Total",
          value: `${totalSessions} session${totalSessions > 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: "Affichées",
          value: `${sessions.length}/${totalSessions}`,
          inline: true,
        },
      )
      .setFooter({
        text: totalSessions > sessionsLimit
          ? `Seules les ${sessionsLimit} sessions les plus récentes sont affichées. Utilise /session info pour le détail.`
          : "Utilise /session info pour afficher le détail d'une session.",
      })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
