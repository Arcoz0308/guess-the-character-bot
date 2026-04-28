import { createEvent } from "arcscord";

export const message_deleteEvent = createEvent({
  event: "messageDelete",
  name: "message_delete",
  run: (ctx, ..._args) => {
    return ctx.ok(true);
  },
});
