import type { AutocompleteContext } from "arcscord";
import type { Guild, Message, User } from "discord.js";
import { prisma } from "#/prisma/prisma";
import { EmbedBuilder } from "discord.js";
import { PointAwardStatus } from "../../../generated/prisma/enums";
import { canManageSession, findActiveSessionForGuild, formatGtcSessionStatus, upsertDiscordUser } from "../../utils/gtc_helpers";

export const awardsHistoryLimit = 10;
export const leaderboardLimit = 10;

export function formatUserName(user: { username: string; globalName: string | null }) {
  return user.globalName ?? user.username;
}

export function formatDate(date: Date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

export function formatPoints(points: number) {
  return `${points} point${Math.abs(points) > 1 ? "s" : ""}`;
}

export const canManageSessionPoints = canManageSession;

export async function findVisibleSessionForGuild(sessionId: number, guildId: string) {
  return prisma.gtcSession.findFirst({
    where: {
      id: sessionId,
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
    include: {
      organizerGuild: true,
    },
  });
}

export async function resolveActivePointSession(guild: Guild) {
  const session = await findActiveSessionForGuild(guild.id);
  if (!session) {
    return null;
  }

  if (!session.pointsEnabled) {
    return null;
  }

  return session;
}

export async function sendVisibleSessionAutocomplete(ctx: AutocompleteContext) {
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
}

export async function resolveOriginalMessageFromContextMessage(message: Message) {
  const deliveredMessage = await prisma.deliveredMessage.findUnique({
    where: {
      id: message.id,
    },
    include: {
      originalMessage: {
        include: {
          author: true,
        },
      },
    },
  });

  if (deliveredMessage?.originalMessage) {
    return deliveredMessage.originalMessage;
  }

  return prisma.originalMessage.findUnique({
    where: {
      id: message.id,
    },
    include: {
      author: true,
    },
  });
}

export async function awardPoints(params: {
  guildId: string;
  originalMessageId?: string;
  points: number;
  reason?: string;
  sessionId: number;
  user: User;
  awardedBy: User;
}) {
  await upsertDiscordUser(params.user);
  await upsertDiscordUser(params.awardedBy);

  return prisma.$transaction(async (tx) => {
    const award = await tx.pointAward.create({
      data: {
        sessionId: params.sessionId,
        guildId: params.guildId,
        awardedToId: params.user.id,
        points: params.points,
        reason: params.reason,
        awardedById: params.awardedBy.id,
        originalMessageId: params.originalMessageId,
      },
      include: {
        awardedTo: true,
        session: true,
      },
    });

    const score = await tx.userScore.upsert({
      where: {
        sessionId_userId: {
          sessionId: params.sessionId,
          userId: params.user.id,
        },
      },
      update: {
        points: {
          increment: params.points,
        },
      },
      create: {
        sessionId: params.sessionId,
        userId: params.user.id,
        points: params.points,
      },
    });

    return { award, score };
  });
}

export async function revokeAward(params: {
  awardId: number;
  revokedBy: User;
}) {
  await upsertDiscordUser(params.revokedBy);

  return prisma.$transaction(async (tx) => {
    const award = await tx.pointAward.findUnique({
      where: {
        id: params.awardId,
      },
      include: {
        awardedTo: true,
        session: true,
      },
    });

    if (!award || award.status === PointAwardStatus.REVOKED) {
      return null;
    }

    const revokedAward = await tx.pointAward.update({
      where: {
        id: params.awardId,
      },
      data: {
        status: PointAwardStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: params.revokedBy.id,
      },
      include: {
        awardedTo: true,
        session: true,
      },
    });

    await tx.userScore.upsert({
      where: {
        sessionId_userId: {
          sessionId: award.sessionId,
          userId: award.awardedToId,
        },
      },
      update: {
        points: {
          decrement: award.points,
        },
      },
      create: {
        sessionId: award.sessionId,
        userId: award.awardedToId,
        points: -award.points,
      },
    });

    return revokedAward;
  });
}

export async function buildScoreEmbed(guildId: string, user: User) {
  const activeSession = await findActiveSessionForGuild(guildId);
  const currentScorePromise = activeSession
    ? prisma.userScore.findUnique({
        where: {
          sessionId_userId: {
            sessionId: activeSession.id,
            userId: user.id,
          },
        },
      })
    : Promise.resolve(null);

  const [currentScore, pastScores] = await Promise.all([
    currentScorePromise,
    prisma.userScore.findMany({
      where: {
        userId: user.id,
        session: {
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
          ...(activeSession
            ? {
                id: {
                  not: activeSession.id,
                },
              }
            : {}),
        },
      },
      include: {
        session: true,
      },
      orderBy: [
        {
          session: {
            createdAt: "desc",
          },
        },
      ],
      take: 8,
    }),
  ]);

  const currentValue = activeSession
    ? `${formatPoints(currentScore?.points ?? 0)} - #${activeSession.id} ${activeSession.name}`
    : "Aucune session active sur ce serveur.";
  const pastValue = pastScores.length > 0
    ? pastScores.map(score => `#${score.session.id} ${score.session.name} : ${formatPoints(score.points)}`).join("\n")
    : "Aucun score passé.";
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle(`Score de ${user.globalName ?? user.username}`)
    .addFields(
      {
        name: "Score actuel",
        value: currentValue,
        inline: false,
      },
      {
        name: "Historique passé",
        value: pastValue.slice(0, 1024),
        inline: false,
      },
    )
    .setTimestamp();
}
