import { createCommand } from "arcscord";

export const pingCommand = createCommand({
  build: {
    slash: {
      name: "ping",
      description: "Vérifier si le bot répond",
    },
  },
  run: (ctx) => {
    return ctx.reply("Pong !", { ephemeral: true });
  },
});
