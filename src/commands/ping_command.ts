import { createCommand } from "arcscord";

export const pingCommand = createCommand({
  build: {
    slash: {
      name: "ping",
      description: "contrôle si le bot réponds !",
    },
  },
  run: (ctx) => {
    return ctx.reply("Pong!", { ephemeral: true });
  },
});
