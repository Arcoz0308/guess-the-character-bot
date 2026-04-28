// AUTO GENERATED FILE AND AUTO UPDATED WITH CLI
import type { HandlersList } from "arcscord";
import { author_idCommand } from "./commands/author_id_command";
import { message_infoCommand } from "./commands/message_info_command";
import { pingCommand } from "./commands/ping_command";
import { sessionCommandDef } from "./commands/session/def";
import { sessionCreateModal } from "./components/session_create_modal";
import { sessionJoinButton } from "./components/session_join_buttons";
import { messageCreateEvent } from "./events/message_create";
import { message_deleteEvent } from "./events/message_delete";
import { messageEditEvent } from "./events/message_edit";
import { reactionAddEvent } from "./events/reaction_add";

export default {
  commands: [pingCommand, message_infoCommand, author_idCommand, sessionCommandDef],
  components: [sessionCreateModal, sessionJoinButton],
  events: [reactionAddEvent, messageCreateEvent, messageEditEvent, message_deleteEvent],
  tasks: [],
} satisfies HandlersList;
