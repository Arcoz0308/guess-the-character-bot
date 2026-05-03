import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { canManageSessionPoints, formatPoints, revokeAward } from "./helpers";

export const revokeCommand = createCommand({
  build: {
    name: "revoke",
    description: "Révoquer une attribution de points",
    options: {
      attribution: {
        type: "integer",
        description: "Identifiant de l'attribution à révoquer",
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

    const award = await prisma.pointAward.findUnique({
      where: {
        id: ctx.options.attribution,
      },
      include: {
        session: {
          include: {
            guilds: true,
          },
        },
      },
    });

    if (!award) {
      return ctx.reply("Attribution introuvable.", { ephemeral: true });
    }
    const visible = award.session.organizerGuildId === guild.id || award.session.guilds.some(sessionGuild => sessionGuild.guildId === guild.id);
    if (!visible) {
      return ctx.reply("Cette attribution n'appartient pas à une session visible depuis ce serveur.", { ephemeral: true });
    }
    if (!(await canManageSessionPoints(award.sessionId, ctx.user.id))) {
      return ctx.reply("Seuls les administrateurs et organisateurs de cette session peuvent révoquer des points.", { ephemeral: true });
    }

    const revokedAward = await revokeAward({
      awardId: award.id,
      revokedBy: ctx.user,
    });

    if (!revokedAward) {
      return ctx.reply("Cette attribution est déjà révoquée.", { ephemeral: true });
    }

    return ctx.reply({
      content: [
        `Attribution #${revokedAward.id} révoquée.`,
        `Joueur : <@${revokedAward.awardedToId}>`,
        `Points retirés : ${formatPoints(revokedAward.points)}`,
      ].join("\n"),
      ephemeral: true,
    });
  },
});
