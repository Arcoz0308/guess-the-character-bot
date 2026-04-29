import { prisma } from "#/prisma/prisma";
import { buildButtonActionRow, createCommand } from "arcscord";
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../../generated/prisma/enums";
import { sessionJoinButton } from "../../components/session_join_buttons";
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
    if (!ctx.interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return ctx.reply("Seul un administrateur Discord peut ajouter ce serveur à une session.", { ephemeral: true });
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

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle("Confirmer la participation")
      .setDescription(`Tu es sur le point d'ajouter **${guild.name}** à la session **${invite.session.name}**.`)
      .addFields(
        {
          name: "Session",
          value: `#${invite.session.id}`,
          inline: true,
        },
        {
          name: "Ce que cela autorise",
          value: [
            "Les messages du salon GTC configuré sur ce serveur pourront être relayés aux autres serveurs de la session.",
            "Les messages relayés depuis les autres serveurs pourront être envoyés dans le salon GTC configuré ici.",
            "Le serveur organisateur pourra retirer ce serveur de la session.",
            "Aucun rôle organisateur n'est ajouté automatiquement.",
          ].join("\n"),
          inline: false,
        },
        {
          name: "Mentions de rôle",
          value: [
            "Les messages envoyés depuis un serveur participant sont relayés par webhook sans traduction de ping.",
            "Les messages du serveur organisateur envoyés par un admin/organisateur de session peuvent ping le rôle GTC configuré.",
            "Seul le rôle défini dans les paramètres du serveur peut être ping par le relais.",
            "Si aucun rôle GTC n'est configuré sur ce serveur, aucun ping de rôle ne sera autorisé ici.",
          ].join("\n"),
          inline: false,
        },
      )
      .setTimestamp();

    return ctx.reply({
      components: [
        buildButtonActionRow(
          sessionJoinButton.build("accept", String(invite.id), ctx.user.id),
          sessionJoinButton.build("cancel", String(invite.id), ctx.user.id),
        ),
      ],
      embeds: [embed],
      ephemeral: true,
    });
  },
});
