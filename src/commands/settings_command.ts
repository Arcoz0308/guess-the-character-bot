import { createCommand } from "arcscord";
import { buildSettingsPanel } from "../components/settings_panel";

export const settingsCommand = createCommand({
  build: {
    slash: {
      name: "settings",
      description: "Afficher le panneau de configuration GTC du serveur",
      contexts: ["guild"],
      defaultMemberPermissions: "Administrator",
    },
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    return ctx.reply(await buildSettingsPanel(guild, ctx.user.id, undefined, ctx.client), { ephemeral: true });
  },
});
