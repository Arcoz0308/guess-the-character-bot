import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { GtcSessionMode } from "../../../../generated/prisma/enums";
import { upsertDiscordUser } from "../../../utils/gtc_helpers";
import { generateInviteCode, hashInviteCode, isSessionAdmin, sendSessionAutocomplete } from "../helpers";

export const createSubGroupCommand = createCommand({
  build: {
    name: "create",
    description: "Créer une invitation pour rejoindre une session interserveur",
    options: {
      session: {
        type: "string",
        description: "Session concernée",
        required: true,
        autocomplete: true,
      },
      max_uses: {
        type: "integer",
        description: "Nombre maximum d'utilisations",
        required: false,
        min_value: 1,
        max_value: 100,
      },
      expires_hours: {
        type: "integer",
        description: "Expiration en heures",
        required: false,
        min_value: 1,
        max_value: 8760,
      },
    } as const,
  },
  autocomplete: ctx => sendSessionAutocomplete(ctx, true),
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const sessionId = Number.parseInt(ctx.options.session, 10);
    if (!Number.isInteger(sessionId)) {
      return ctx.reply("La session sélectionnée est invalide.", { ephemeral: true });
    }

    const session = await prisma.gtcSession.findUnique({
      where: {
        id: sessionId,
      },
    });
    if (!session || session.organizerGuildId !== guild.id) {
      return ctx.reply("Session introuvable depuis ce serveur organisateur.", { ephemeral: true });
    }
    if (session.mode !== GtcSessionMode.INTER_GUILD) {
      return ctx.reply("Les invitations sont disponibles uniquement pour les sessions interserveur.", { ephemeral: true });
    }
    if (!(await isSessionAdmin(session.id, ctx.user.id))) {
      return ctx.reply("Seul un administrateur de cette session peut créer une invitation.", { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);

    const code = generateInviteCode();
    const expiresAt = ctx.options.expires_hours
      ? new Date(Date.now() + ctx.options.expires_hours * 60 * 60 * 1000)
      : null;
    const invite = await prisma.gtcSessionInvite.create({
      data: {
        sessionId: session.id,
        codeHash: hashInviteCode(code),
        createdById: ctx.user.id,
        maxUses: ctx.options.max_uses,
        expiresAt,
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle("Invitation créée")
      .setDescription(`Invitation pour **${session.name}**.`)
      .addFields(
        {
          name: "Session",
          value: `#${session.id}`,
          inline: true,
        },
        {
          name: "Invitation",
          value: `#${invite.id}`,
          inline: true,
        },
        {
          name: "Code",
          value: `\`${code}\``,
          inline: false,
        },
        {
          name: "Utilisations",
          value: invite.maxUses ? `0/${invite.maxUses}` : "Illimitées",
          inline: true,
        },
        {
          name: "Expiration",
          value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:f>` : "Aucune",
          inline: true,
        },
      )
      .setFooter({ text: "Le code ne sera plus affiché ensuite." })
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
