import { createCommand } from "arcscord";
import { buildSettingsPanel } from "../../components/settings_panel";
import { isBotAdmin } from "./helpers";

export const adminSettingsCommand = createCommand({
  build: {
    name: "settings",
    description: "Afficher le panneau de configuration GTC sans permission Discord admin",
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }
    if (!(await isBotAdmin(ctx.user.id))) {
      return ctx.reply("Cette commande est réservée aux administrateurs du bot.", { ephemeral: true });
    }

    return ctx.reply(await buildSettingsPanel(guild, ctx.user.id, undefined, ctx.client), { ephemeral: true });
  },
});
