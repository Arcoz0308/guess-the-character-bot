import { createCommand } from "arcscord";
import { buildScoreEmbed } from "./points/helpers";

export const scoreCommand = createCommand({
  build: {
    slash: {
      name: "score",
      description: "Afficher le score actuel et l'historique d'un joueur",
      contexts: ["guild"],
      options: {
        joueur: {
          type: "user",
          description: "Joueur à afficher",
          required: false,
        },
      } as const,
    },
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const user = ctx.options.joueur ?? ctx.user;
    const embed = await buildScoreEmbed(guild.id, user);

    return ctx.reply({ embeds: [embed], ephemeral: true });
  },
});
