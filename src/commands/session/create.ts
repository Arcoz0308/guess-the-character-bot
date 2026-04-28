import { createCommand } from "arcscord";
import { sessionCreateModal } from "../../components/session_create_modal";

export const createSubCommand = createCommand({
  build: {
    name: "create",
    description: "Créer une session GTC",
  },
  run: (ctx) => {
    if (!ctx.guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    return ctx.showModal(sessionCreateModal.build("Créer une session GTC"));
  },
});
