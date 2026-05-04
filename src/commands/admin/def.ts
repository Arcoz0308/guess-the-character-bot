import type { SlashWithSubsCommandDefinition } from "arcscord";
import { adminJoinCommand } from "./join";
import { adminSettingsCommand } from "./settings";

export const adminCommandDef = {
  name: "admin",
  description: "Commandes d'administration du bot",
  contexts: ["guild"],
  subCommands: [adminSettingsCommand, adminJoinCommand],
} satisfies SlashWithSubsCommandDefinition;
