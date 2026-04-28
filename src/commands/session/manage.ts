import { createCommand } from "arcscord";

export const manageCommand = createCommand({
  build: {
    name: "manage",
    description: "A sub command",
  },
  run: (ctx) => {
    return ctx.reply("Hello world!");
  },
});
