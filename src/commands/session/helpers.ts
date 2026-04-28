import type { AutocompleteContext } from "arcscord";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "#/prisma/prisma";
import { GtcSessionManagerRole, GtcSessionStatus } from "../../../generated/prisma/enums";
import { formatGtcSessionStatus } from "../../utils/gtc_helpers";

export function hashInviteCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function generateInviteCode() {
  return `GTC-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function isSessionAdmin(sessionId: number, userId: string) {
  const manager = await prisma.gtcSessionManager.findFirst({
    where: {
      sessionId,
      userId,
      role: GtcSessionManagerRole.ADMIN,
    },
  });

  return manager !== null;
}

export async function findVisibleSession(sessionId: number, guildId: string) {
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
      guilds: {
        include: {
          guild: true,
        },
      },
    },
  });
}

export async function findActiveSessionConflict(guildId: string, ignoredSessionId?: number) {
  return prisma.gtcSession.findFirst({
    where: {
      status: GtcSessionStatus.ACTIVE,
      id: ignoredSessionId
        ? {
            not: ignoredSessionId,
          }
        : undefined,
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
    orderBy: [
      {
        startedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
}

export async function sendSessionAutocomplete(ctx: AutocompleteContext, organizerOnly = false) {
  const guildId = ctx.guildId;
  if (!guildId) {
    return ctx.sendChoices([]);
  }

  const focus = ctx.focus.trim();
  const sessionId = Number.parseInt(focus, 10);
  const sessions = await prisma.gtcSession.findMany({
    where: {
      AND: [
        organizerOnly
          ? {
              organizerGuildId: guildId,
            }
          : {
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

export function sessionCanAcceptGuild(status: GtcSessionStatus) {
  return status === GtcSessionStatus.PLANNED || status === GtcSessionStatus.ACTIVE;
}
