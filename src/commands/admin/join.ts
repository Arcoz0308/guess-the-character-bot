import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../../generated/prisma/enums";
import { findActiveSessionConflict, sessionCanAcceptGuild } from "../session/helpers";
import { isBotAdmin } from "./helpers";

export const adminJoinCommand = createCommand({
  build: {
    name: "join",
    description: "Ajouter ce serveur à une session GTC sans code d'invitation",
    options: {
      session: {
        type: "integer",
        description: "ID de la session à rejoindre",
        required: true,
        min_value: 1,
      },
    } as const,
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }
    if (!(await isBotAdmin(ctx.user.id))) {
      return ctx.reply("Cette commande est réservée aux administrateurs du bot.", { ephemeral: true });
    }

    const session = await prisma.gtcSession.findUnique({
      where: {
        id: ctx.options.session,
      },
    });
    if (!session) {
      return ctx.reply("Session introuvable.", { ephemeral: true });
    }
    if (session.mode !== GtcSessionMode.INTER_GUILD) {
      return ctx.reply("Cette session n'est pas une session interserveur.", { ephemeral: true });
    }
    if (!sessionCanAcceptGuild(session.status)) {
      return ctx.reply("Cette session n'accepte plus de nouveaux serveurs.", { ephemeral: true });
    }
    if (session.organizerGuildId === guild.id) {
      return ctx.reply("Le serveur organisateur fait déjà partie de cette session.", { ephemeral: true });
    }
    if (session.status === GtcSessionStatus.ACTIVE) {
      const activeConflict = await findActiveSessionConflict(guild.id, session.id);
      if (activeConflict) {
        return ctx.reply(
          `Ce serveur participe déjà à une session active : **${activeConflict.name}** (#${activeConflict.id}). Termine ou quitte cette session avant d'en rejoindre une autre active.`,
          { ephemeral: true },
        );
      }
    }

    const existingGuild = await prisma.gtcSessionGuild.findUnique({
      where: {
        sessionId_guildId: {
          sessionId: session.id,
          guildId: guild.id,
        },
      },
    });
    if (existingGuild) {
      return ctx.reply("Ce serveur participe déjà à cette session.", { ephemeral: true });
    }

    await prisma.$transaction(async (tx) => {
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
          sessionId: session.id,
          guildId: guild.id,
        },
      });
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle("Session rejointe")
      .setDescription(`Le serveur **${guild.name}** a rejoint **${session.name}** sans invitation.`)
      .addFields({
        name: "Session",
        value: `#${session.id}`,
        inline: true,
      })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
