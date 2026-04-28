import type { Guild, User } from "discord.js";
import type { GtcSessionMode } from "../../generated/prisma/enums";
import { prisma } from "#/prisma/prisma";
import { GtcSessionStatus } from "../../generated/prisma/enums";

export async function upsertDiscordUser(user: User) {
  return prisma.user.upsert({
    where: {
      id: user.id,
    },
    update: {
      active: true,
      bot: user.bot,
      globalName: user.globalName,
      username: user.username,
    },
    create: {
      id: user.id,
      active: true,
      bot: user.bot,
      globalName: user.globalName,
      username: user.username,
    },
  });
}

export async function findActiveSessionForGuild(guildId: string, mode?: GtcSessionMode) {
  return prisma.gtcSession.findFirst({
    where: {
      mode,
      status: GtcSessionStatus.ACTIVE,
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
      guilds: {
        include: {
          guild: true,
        },
      },
      organizerGuild: true,
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

export function getSessionGuildConfig(
  session: NonNullable<Awaited<ReturnType<typeof findActiveSessionForGuild>>>,
  guildId: string,
) {
  if (session.organizerGuildId === guildId) {
    return session.organizerGuild;
  }

  return session.guilds.find(sessionGuild => sessionGuild.guildId === guildId)?.guild;
}

export function getRelayTargetGuilds(
  session: NonNullable<Awaited<ReturnType<typeof findActiveSessionForGuild>>>,
  sourceGuildId: string,
) {
  const guilds = [session.organizerGuild, ...session.guilds.map(sessionGuild => sessionGuild.guild)];
  const uniqueGuilds = new Map(guilds.map(guild => [guild.id, guild]));

  return [...uniqueGuilds.values()].filter((guild) => {
    return guild.id !== sourceGuildId && guild.relayMessages && guild.channelId;
  });
}

export function translatePingRole(content: string, sourceGuild: { pingRoleId: string | null }, targetGuild: { pingRoleId: string | null }) {
  if (!sourceGuild.pingRoleId || !targetGuild.pingRoleId) {
    return content;
  }

  return content
    .replaceAll(sourceGuild.pingRoleId, targetGuild.pingRoleId)
    .replaceAll(`<@&${sourceGuild.pingRoleId}>`, `<@&${targetGuild.pingRoleId}>`);
}

export function messageUrl(guildId: string, channelId: string, messageId: string) {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function discordGuildName(guild: Guild) {
  return guild.name;
}
