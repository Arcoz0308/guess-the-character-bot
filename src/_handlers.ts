// AUTO GENERATED FILE AND AUTO UPDATED WITH CLI
import type { HandlersList } from "arcscord";
import { adminCommandDef } from "./commands/admin/def";
import { author_idCommand } from "./commands/author_id_command";
import { give_pointCommand } from "./commands/give_point_command";
import { leaderboardCommand } from "./commands/leaderboard_command";
import { message_infoCommand } from "./commands/message_info_command";
import { pingCommand } from "./commands/ping_command";
import { pointsCommandDef } from "./commands/points/def";
import { scoreCommand } from "./commands/score_command";
import { sessionCommandDef } from "./commands/session/def";
import { settingsCommand } from "./commands/settings_command";
import { sessionCreateModal } from "./components/session_create_modal";
import { sessionJoinButton } from "./components/session_join_buttons";
import { sessionManageButton } from "./components/session_manage_buttons";
import { sessionManagerModal } from "./components/session_manager_modal";
import { settingsButton, settingsChannelSelect, settingsRoleSelect, settingsWebhookModal } from "./components/settings_panel";
import { messageCreateEvent } from "./events/message_create";
import { messageDeleteEvent } from "./events/message_delete";
import { messageEditEvent } from "./events/message_edit";
import { reactionAddEvent } from "./events/reaction_add";

export default {
  commands: [
    pingCommand,
    adminCommandDef,
    message_infoCommand,
    author_idCommand,
    sessionCommandDef,
    settingsCommand,
    leaderboardCommand,
    scoreCommand,
    pointsCommandDef,
    give_pointCommand,
  ],
  components: [
    sessionCreateModal,
    sessionJoinButton,
    sessionManageButton,
    sessionManagerModal,
    settingsButton,
    settingsChannelSelect,
    settingsRoleSelect,
    settingsWebhookModal,
  ],
  events: [reactionAddEvent, messageCreateEvent, messageEditEvent, messageDeleteEvent],
  tasks: [],
} satisfies HandlersList;
