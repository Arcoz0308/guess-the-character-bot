// AUTO GENERATED FILE AND AUTO UPDATED WITH CLI
import type { HandlersList } from "arcscord";
import { pingCommand } from "./commands/ping_command";
import { messageCreateEvent } from "./events/message_create";
import { messageEditEvent } from "./events/message_edit";
import { reactionAddEvent } from "./events/reaction_add";

export default {
  commands: [pingCommand],
  components: [],
  events: [reactionAddEvent, messageCreateEvent, messageEditEvent],
  tasks: [],
} satisfies HandlersList;
