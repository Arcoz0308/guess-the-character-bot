import type { SlashWithSubsCommandDefinition } from "arcscord";
import { createSubCommand } from "./create";
import { infoCommand } from "./info";
import { createSubGroupCommand } from "./invite/create";
import { inviteListCommand } from "./invite/list";
import { revokeCommand } from "./invite/revoke";
import { joinCommand } from "./join";
import { leaveCommand } from "./leave";
import { listCommand } from "./list";
import { manageCommand } from "./manage";
import { removeCommand } from "./serveur/remove";

export const sessionCommandDef = {
  name: "session",
  description: "Gérer les sessions GTC",
  subCommands: [createSubCommand, manageCommand, listCommand, infoCommand, joinCommand, leaveCommand],
  contexts: ["guild"],
  subCommandsGroups: {
    invite: {
      description: "Gérer les invitations de session",
      subCommands: [createSubGroupCommand, inviteListCommand, revokeCommand],
    },
    serveur: {
      description: "Gérer les serveurs participants",
      subCommands: [removeCommand],
    },
  },
} satisfies SlashWithSubsCommandDefinition;
