import { prisma } from "#/prisma/prisma";
import { createCommand } from "arcscord";
import { isSessionAdmin } from "../helpers";

export const revokeCommand = createCommand({
  build: {
    name: "revoke",
    description: "Révoquer une invitation de session",
    options: {
      invite: {
        type: "integer",
        description: "ID de l'invitation",
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

    const invite = await prisma.gtcSessionInvite.findUnique({
      where: {
        id: ctx.options.invite,
      },
      include: {
        session: true,
      },
    });
    if (!invite || invite.session.organizerGuildId !== guild.id) {
      return ctx.reply("Invitation introuvable depuis ce serveur organisateur.", { ephemeral: true });
    }
    if (!(await isSessionAdmin(invite.sessionId, ctx.user.id))) {
      return ctx.reply("Seul un admin de cette session peut révoquer une invitation.", { ephemeral: true });
    }
    if (invite.revokedAt) {
      return ctx.reply("Cette invitation est déjà révoquée.", { ephemeral: true });
    }

    await prisma.gtcSessionInvite.update({
      where: {
        id: invite.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return ctx.reply(`Invitation #${invite.id} révoquée.`, { ephemeral: true });
  },
});
