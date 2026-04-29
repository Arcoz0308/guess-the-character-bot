import { prisma } from "#/prisma/prisma";
import { buildClickableButton, createButton } from "arcscord";
import { EmbedBuilder, type Guild, type User } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../generated/prisma/enums";
import { findActiveSessionConflict, sessionCanAcceptGuild } from "../commands/session/helpers";
import { upsertDiscordUser } from "../utils/gtc_helpers";

const sessionJoinButtonMatcher = "button:sessionJoin";

async function acceptSessionJoin(inviteId: number, guild: Guild, user: User) {
  const invite = await prisma.gtcSessionInvite.findUnique({
    where: {
      id: inviteId,
    },
    include: {
      session: true,
    },
  });
  if (!invite) {
    return "Invitation introuvable.";
  }
  if (invite.revokedAt) {
    return "Cette invitation a été révoquée.";
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return "Cette invitation a expiré.";
  }
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    return "Cette invitation n'a plus d'utilisation disponible.";
  }
  if (invite.session.mode !== GtcSessionMode.INTER_GUILD) {
    return "Cette session n'est pas une session interserveur.";
  }
  if (!sessionCanAcceptGuild(invite.session.status)) {
    return "Cette session n'accepte plus de nouveaux serveurs.";
  }
  if (invite.session.organizerGuildId === guild.id) {
    return "Le serveur organisateur fait déjà partie de cette session.";
  }
  if (invite.session.status === GtcSessionStatus.ACTIVE) {
    const activeConflict = await findActiveSessionConflict(guild.id, invite.sessionId);
    if (activeConflict) {
      return `Ce serveur participe déjà à une session active: ${activeConflict.name} (#${activeConflict.id}).`;
    }
  }

  const existingGuild = await prisma.gtcSessionGuild.findUnique({
    where: {
      sessionId_guildId: {
        sessionId: invite.sessionId,
        guildId: guild.id,
      },
    },
  });
  if (existingGuild) {
    return "Ce serveur participe déjà à cette session.";
  }

  await upsertDiscordUser(user);
  const acceptError = await prisma.$transaction(async (tx) => {
    const existingGuildInTransaction = await tx.gtcSessionGuild.findUnique({
      where: {
        sessionId_guildId: {
          sessionId: invite.sessionId,
          guildId: guild.id,
        },
      },
    });
    if (existingGuildInTransaction) {
      return "Ce serveur participe déjà à cette session.";
    }

    const consumedInvite = await tx.gtcSessionInvite.updateMany({
      where: {
        id: invite.id,
        OR: [
          {
            maxUses: null,
          },
          {
            usedCount: {
              lt: invite.maxUses ?? 0,
            },
          },
        ],
      },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });
    if (consumedInvite.count === 0) {
      return "Cette invitation n'a plus d'utilisation disponible.";
    }

    await tx.guild.upsert({
      where: {
        id: guild.id,
      },
      update: {
        name: guild.name,
      },
      create: {
        id: guild.id,
        name: guild.name,
      },
    });
    await tx.gtcSessionGuild.create({
      data: {
        sessionId: invite.sessionId,
        guildId: guild.id,
      },
    });

    return null;
  });
  if (acceptError) {
    return acceptError;
  }

  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle("Session rejointe")
    .setDescription(`Le serveur **${guild.name}** a rejoint **${invite.session.name}**.`)
    .addFields(
      {
        name: "Session",
        value: `#${invite.session.id}`,
        inline: true,
      },
      {
        name: "Rôle local",
        value: "Aucun rôle organisateur ajouté automatiquement",
        inline: false,
      },
    )
    .setTimestamp();
}

export const sessionJoinButton = createButton({
  matcher: sessionJoinButtonMatcher,
  build: (action, inviteId, userId) => buildClickableButton({
    customId: `${sessionJoinButtonMatcher}:${action}:${inviteId}:${userId}`,
    label: action === "accept" ? "Accepter" : "Annuler",
    style: action === "accept" ? "success" : "danger",
  }),
  run: async (ctx) => {
    const [, , action, inviteId, userId] = ctx.customId.split(":");
    if (ctx.user.id !== userId) {
      return ctx.reply("Seule la personne qui a lancé la commande peut répondre à cette confirmation.", { ephemeral: true });
    }

    if (action === "cancel") {
      return ctx.updateMessage({
        components: [],
        content: "Participation annulée.",
        embeds: [],
      });
    }

    const guild = ctx.guild;
    const parsedInviteId = Number.parseInt(inviteId ?? "", 10);
    if (!guild || !Number.isInteger(parsedInviteId)) {
      return ctx.updateMessage({
        components: [],
        content: "Confirmation invalide.",
        embeds: [],
      });
    }

    const result = await acceptSessionJoin(parsedInviteId, guild, ctx.user);
    if (typeof result === "string") {
      return ctx.updateMessage({
        components: [],
        content: result,
        embeds: [],
      });
    }

    return ctx.updateMessage({
      components: [],
      embeds: [result],
    });
  },
});
