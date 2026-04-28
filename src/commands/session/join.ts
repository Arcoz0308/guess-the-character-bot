import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../../generated/prisma/enums";
import { upsertDiscordUser } from "../../utils/gtc_helpers";
import { findActiveSessionConflict, hashInviteCode, sessionCanAcceptGuild } from "./helpers";

export const joinCommand = createCommand({
  build: {
    name: "join",
    description: "Rejoindre une session GTC interserveur avec un code d'invitation",
    options: {
      session: {
        type: "integer",
        description: "ID de la session",
        required: true,
        min_value: 1,
      },
      code: {
        type: "string",
        description: "Code d'invitation",
        required: true,
        min_length: 5,
        max_length: 64,
      },
    } as const,
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const invite = await prisma.gtcSessionInvite.findFirst({
      where: {
        sessionId: ctx.options.session,
        codeHash: hashInviteCode(ctx.options.code),
      },
      include: {
        session: true,
      },
    });
    if (!invite) {
      return ctx.reply("Invitation invalide pour cette session.", { ephemeral: true });
    }
    if (invite.revokedAt) {
      return ctx.reply("Cette invitation a été révoquée.", { ephemeral: true });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      return ctx.reply("Cette invitation a expiré.", { ephemeral: true });
    }
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      return ctx.reply("Cette invitation n'a plus d'utilisation disponible.", { ephemeral: true });
    }
    if (invite.session.mode !== GtcSessionMode.INTER_GUILD) {
      return ctx.reply("Cette session n'est pas une session interserveur.", { ephemeral: true });
    }
    if (!sessionCanAcceptGuild(invite.session.status)) {
      return ctx.reply("Cette session n'accepte plus de nouveaux serveurs.", { ephemeral: true });
    }
    if (invite.session.organizerGuildId === guild.id) {
      return ctx.reply("Le serveur organisateur fait déjà partie de cette session.", { ephemeral: true });
    }
    if (invite.session.status === GtcSessionStatus.ACTIVE) {
      const activeConflict = await findActiveSessionConflict(guild.id, invite.sessionId);
      if (activeConflict) {
        return ctx.reply(
          `Ce serveur participe déjà à une session active: **${activeConflict.name}** (#${activeConflict.id}). Termine ou quitte cette session avant d'en rejoindre une autre active.`,
          { ephemeral: true },
        );
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
      return ctx.reply("Ce serveur participe déjà à cette session.", { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);
    await prisma.$transaction([
      prisma.guild.upsert({
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
      }),
      prisma.gtcSessionGuild.create({
        data: {
          sessionId: invite.sessionId,
          guildId: guild.id,
        },
      }),
      prisma.gtcSessionInvite.update({
        where: {
          id: invite.id,
        },
        data: {
          usedCount: {
            increment: 1,
          },
        },
      }),
    ]);

    const embed = new EmbedBuilder()
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

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
