import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../../generated/prisma/enums";
import { formatGtcSessionMode, formatGtcSessionStatus } from "../../utils/gtc_helpers";

function formatDate(date: Date | null) {
  if (!date) {
    return "Non défini";
  }

  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function truncateField(value: string) {
  if (value.length <= 1024) {
    return value;
  }

  return `${value.slice(0, 1021)}...`;
}

export const infoCommand = createCommand({
  build: {
    name: "info",
    description: "Afficher les informations d'une session GTC",
    options: {
      session: {
        type: "string",
        description: "Session à afficher",
        required: true,
        autocomplete: true,
      },
    } as const,
  },
  autocomplete: async (ctx) => {
    const guildId = ctx.guildId;
    if (!guildId) {
      return ctx.sendChoices([]);
    }

    const focus = ctx.focus.trim();
    const sessionId = Number.parseInt(focus, 10);
    const sessions = await prisma.gtcSession.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                organizerGuildId: guildId,
              },
              {
                guilds: {
                  some: {
                    guildId,
                  },
                },
              },
            ],
          },
          ...(focus.length > 0
            ? [
                {
                  OR: [
                    {
                      name: {
                        contains: focus,
                        mode: "insensitive" as const,
                      },
                    },
                    ...(Number.isInteger(sessionId)
                      ? [
                          {
                            id: sessionId,
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [
        {
          createdAt: "desc",
        },
      ],
      take: 25,
    });

    return ctx.sendChoices(sessions.map((session) => {
      return {
        name: `#${session.id} - ${session.name} (${formatGtcSessionStatus(session.status)})`.slice(0, 100),
        value: String(session.id),
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

    const session = await prisma.gtcSession.findFirst({
      where: {
        id: sessionId,
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
      include: {
        organizerGuild: true,
        guilds: {
          include: {
            guild: true,
          },
          orderBy: {
            joinedAt: "asc",
          },
        },
        managers: {
          include: {
            guild: true,
            user: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        _count: {
          select: {
            originalMessages: true,
            participations: true,
            pointAwards: true,
            scores: true,
          },
        },
      },
    });

    if (!session) {
      return ctx.reply("Session introuvable pour ce serveur.", { ephemeral: true });
    }

    const participantGuilds = session.mode === GtcSessionMode.SINGLE_GUILD
      ? []
      : session.guilds.map(sessionGuild => sessionGuild.guild.name);
    const managers = session.managers.map((manager) => {
      const displayName = manager.user.globalName ?? manager.user.username;
      const guildName = manager.guild?.name ? ` - ${manager.guild.name}` : "";

      return `<@${manager.userId}> (${displayName}) - ${manager.role}${guildName}`;
    });

    const embed = new EmbedBuilder()
      .setColor(session.status === GtcSessionStatus.ACTIVE ? 0x2ECC71 : 0x3498DB)
      .setTitle(`Session GTC #${session.id}`)
      .setDescription(`**${session.name}**`)
      .addFields(
        {
          name: "Statut",
          value: formatGtcSessionStatus(session.status),
          inline: true,
        },
        {
          name: "Mode",
          value: formatGtcSessionMode(session.mode),
          inline: true,
        },
        {
          name: "Points",
          value: session.pointsEnabled
            ? `${session.pointsPerAward} point${session.pointsPerAward > 1 ? "s" : ""} par attribution`
            : "Désactivés",
          inline: true,
        },
        {
          name: "Serveur organisateur",
          value: session.organizerGuild.name,
          inline: true,
        },
        {
          name: "Créée le",
          value: formatDate(session.createdAt),
          inline: true,
        },
        {
          name: "Démarrage",
          value: formatDate(session.startedAt),
          inline: true,
        },
        {
          name: session.mode === GtcSessionMode.SINGLE_GUILD ? "Participation interserveur" : "Serveurs participants",
          value: session.mode === GtcSessionMode.SINGLE_GUILD
            ? "Non applicable en mode serveur seul"
            : participantGuilds.length > 0 ? truncateField(participantGuilds.join("\n")) : "Aucun serveur participant",
          inline: false,
        },
        {
          name: "Gestionnaires",
          value: managers.length > 0 ? truncateField(managers.join("\n")) : "Aucun gestionnaire",
          inline: false,
        },
        {
          name: "Activité",
          value: [
            `Participants: ${session._count.participations}`,
            `Points attribués: ${session._count.pointAwards}`,
            `Messages envoyés : ${session._count.originalMessages}`,
          ].join("\n"),
          inline: false,
        },
      )
      .setTimestamp(session.updatedAt);

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
