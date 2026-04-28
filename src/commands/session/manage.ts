import { createCommand } from "arcscord";
import { buildSessionManageMessage } from "../../components/session_manage_buttons";
import { isSessionAdmin, sendSessionAutocomplete } from "./helpers";

export const manageCommand = createCommand({
  build: {
    name: "manage",
    description: "Afficher le panneau de gestion d'une session GTC",
    options: {
      session: {
        type: "string",
        description: "Session à gérer",
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
    if (!(await isSessionAdmin(sessionId, ctx.user.id))) {
      return ctx.reply("Seul un admin de cette session peut ouvrir le panneau de gestion.", { ephemeral: true });
    }

    return ctx.reply(await buildSessionManageMessage(sessionId, ctx.user.id), { ephemeral: true });
  },
});
