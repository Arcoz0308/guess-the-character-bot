import { prisma } from "#/prisma/prisma";
import { buildLabel, buildModal, buildRadioGroup, buildTextInput, createModal, type ModalContextValue } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionManagerRole, GtcSessionMode, GtcSessionStatus } from "../../generated/prisma/enums";
import { formatGtcSessionModeDetails, upsertDiscordUser } from "../utils/gtc_helpers";

const sessionCreateModalMatcher = "modal:sessionCreate";

function readStringValue(value: ModalContextValue | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

export const sessionCreateModal = createModal({
  matcher: sessionCreateModalMatcher,
  build: title => buildModal(
    title,
    sessionCreateModalMatcher,
    buildLabel({
      label: "Nom de la session",
      component: buildTextInput({
        customId: "sessionName",
        style: "short",
        placeholder: "Entrez le nom de la session",
        required: true,
      }),
    }),
    buildLabel({
      label: "Type de session",
      component: buildRadioGroup({
        customId: "sessionMode",
        required: true,
        options: [
          {
            label: "Serveur seul",
            value: GtcSessionMode.SINGLE_GUILD,
            description: "Session limitée au serveur courant, sans relais de messages.",
            default: true,
          },
          {
            label: "Interserveur",
            value: GtcSessionMode.INTER_GUILD,
            description: "Session pilotée depuis ce serveur avec relais vers les serveurs participants.",
          },
        ],
      }),
    }),
    buildLabel({
      label: "Points par attribution",
      component: buildTextInput({
        customId: "pointsPerAward",
        style: "short",
        placeholder: "1",
        value: "1",
        required: true,
      }),
    }),
  ),
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette action doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const sessionName = readStringValue(ctx.values.get("sessionName"));
    if (!sessionName) {
      return ctx.reply("Le nom de la session est requis.", { ephemeral: true });
    }
    const trimmedSessionName = sessionName.trim();
    if (trimmedSessionName.length === 0) {
      return ctx.reply("Le nom de la session ne peut pas être vide.", { ephemeral: true });
    }

    if (trimmedSessionName.length > 100) {
      return ctx.reply("Le nom de la session ne peut pas dépasser 100 caractères.", { ephemeral: true });
    }

    const mode = readStringValue(ctx.values.get("sessionMode"));
    if (mode !== GtcSessionMode.INTER_GUILD && mode !== GtcSessionMode.SINGLE_GUILD) {
      return ctx.reply("Le mode de session est invalide.", { ephemeral: true });
    }

    const pointsPerAward = readStringValue(ctx.values.get("pointsPerAward"));
    if (!pointsPerAward || !/^\d+$/.test(pointsPerAward)) {
      return ctx.reply("Le nombre de points doit être un nombre entier.", { ephemeral: true });
    }

    const parsedPointsPerAward = Number.parseInt(pointsPerAward ?? "1", 10);
    if (!Number.isInteger(parsedPointsPerAward) || parsedPointsPerAward < 1 || parsedPointsPerAward > 100) {
      return ctx.reply("Le nombre de points doit être compris entre 1 et 100.", { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);
    const session = await prisma.$transaction(async (tx) => {
      await tx.guild.upsert({
        where: {
          id: guild.id,
        },
        update: {
          isOrganizerGuild: mode === GtcSessionMode.INTER_GUILD ? true : undefined,
          name: guild.name,
        },
        create: {
          id: guild.id,
          isOrganizerGuild: mode === GtcSessionMode.INTER_GUILD,
          name: guild.name,
        },
      });

      const createdSession = await tx.gtcSession.create({
        data: {
          name: trimmedSessionName,
          mode,
          status: GtcSessionStatus.PLANNED,
          organizerGuildId: guild.id,
          pointsPerAward: parsedPointsPerAward,
        },
      });

      if (mode === GtcSessionMode.SINGLE_GUILD) {
        await tx.gtcSessionGuild.create({
          data: {
            guildId: guild.id,
            sessionId: createdSession.id,
          },
        });
      }

      await tx.gtcSessionManager.create({
        data: {
          guildId: guild.id,
          sessionId: createdSession.id,
          userId: ctx.user.id,
          role: GtcSessionManagerRole.ADMIN,
        },
      });

      return createdSession;
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle("Session GTC créée")
      .setDescription(`La session **${session.name}** est prête à être configurée.`)
      .addFields(
        {
          name: "ID",
          value: `\`${session.id}\``,
          inline: true,
        },
        {
          name: "Mode",
          value: formatGtcSessionModeDetails(session.mode),
          inline: true,
        },
        {
          name: "Points",
          value: `${session.pointsPerAward} point${session.pointsPerAward > 1 ? "s" : ""} par attribution`,
          inline: true,
        },
        {
          name: "Serveur organisateur",
          value: guild.name,
          inline: false,
        },
      )
      .setFooter({ text: "Statut : planifiée" })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
