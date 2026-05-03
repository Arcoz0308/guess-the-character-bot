import type { SlashWithSubsCommandDefinition } from "arcscord";
import { giveCommand } from "./give";
import { historyCommand } from "./history";
import { revokeCommand } from "./revoke";

export const pointsCommandDef = {
  name: "points",
  description: "Gérer les points GTC",
  contexts: ["guild"],
  subCommands: [giveCommand, revokeCommand, historyCommand],
} satisfies SlashWithSubsCommandDefinition;
