import type { SlashWithSubsCommandDefinition } from "arcscord";
import { createSubCommand } from "./create";

export const sessionCommandDef = {
  name: "session",
  description: "Command description",
  subCommands: [createSubCommand],
  defaultMemberPermissions: "Administrator",
  contexts: ["guild"],
} satisfies SlashWithSubsCommandDefinition;
