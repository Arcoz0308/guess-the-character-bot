import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { EmbedBuilder } from "discord.js";
import { isSessionAdmin, sendSessionAutocomplete } from "../helpers";

function formatInviteStatus(invite: { expiresAt: Date | null; maxUses: number | null; revokedAt: Date | null; usedCount: number }) {
  if (invite.revokedAt) {
    return "Révoquée";
  }

  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return "Expirée";
  }

  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
    return "Épuisée";
  }

  return "Active";
}

export const inviteListCommand = createCommand({
  build: {
    name: "list",
    description: "Lister les invitations d'une session",
    options: {
      session: {
        type: "string",
        description: "Session concernée",
        required: true,
        autocomplete: true,
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
        organizerGuildId: guild.id,
      },
      include: {
        invites: {
          include: {
            createdBy: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 25,
        },
      },
    });
    if (!session) {
      return ctx.reply("Session introuvable depuis ce serveur organisateur.", { ephemeral: true });
    }
    if (!(await isSessionAdmin(session.id, ctx.user.id))) {
      return ctx.reply("Seul un admin de cette session peut lister les invitations.", { ephemeral: true });
    }
    if (session.invites.length === 0) {
      return ctx.reply("Aucune invitation n'a été créée pour cette session.", { ephemeral: true });
    }

    const lines = session.invites.map((invite) => {
      const uses = invite.maxUses ? `${invite.usedCount}/${invite.maxUses}` : `${invite.usedCount}/illimité`;
      const expires = invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : "sans expiration";

      return `**#${invite.id}** - ${formatInviteStatus(invite)} | ${uses} | ${expires} | créée par <@${invite.createdById}>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle(`Invitations de session #${session.id}`)
      .setDescription(lines.join("\n"))
      .setTimestamp();

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
