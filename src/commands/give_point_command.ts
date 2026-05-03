import { createCommand } from "arcscord";
import { GtcSessionStatus } from "../../generated/prisma/enums";
import {
  awardPoints,
  canManageSessionPoints,
  findVisibleSessionForGuild,
  formatPoints,
  resolveActivePointSession,
  resolveOriginalMessageFromContextMessage,
} from "./points/helpers";

export const give_pointCommand = createCommand({
  build: {
    message: {
      name: "give-points",
      contexts: ["guild"],
    },
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const originalMessage = await resolveOriginalMessageFromContextMessage(ctx.targetMessage);
    const session = originalMessage?.sessionId
      ? await findVisibleSessionForGuild(originalMessage.sessionId, guild.id)
      : await resolveActivePointSession(guild);

    if (!session) {
      return ctx.reply("Ce message n'est pas lié à une session GTC active avec les points activés.", { ephemeral: true });
    }
    if (session.status !== GtcSessionStatus.ACTIVE) {
      return ctx.reply("Les points ne peuvent être attribués que sur une session active.", { ephemeral: true });
    }
    if (!session.pointsEnabled) {
      return ctx.reply("Les points sont désactivés pour cette session.", { ephemeral: true });
    }
    if (!(await canManageSessionPoints(session.id, ctx.user.id))) {
      return ctx.reply("Seuls les administrateurs et organisateurs de cette session peuvent attribuer des points.", { ephemeral: true });
    }

    const awardedToId = originalMessage?.authorId ?? ctx.targetMessage.author.id;
    const awardedTo = awardedToId === ctx.targetMessage.author.id
      ? ctx.targetMessage.author
      : await ctx.client.users.fetch(awardedToId);
    if (awardedTo.bot) {
      return ctx.reply("Impossible d'attribuer des points à un bot.", { ephemeral: true });
    }

    const points = session.pointsPerAward;
    const { award, score } = await awardPoints({
      guildId: guild.id,
      sessionId: session.id,
      user: awardedTo,
      awardedBy: ctx.user,
      points,
      reason: "Attribution via message",
      originalMessageId: originalMessage?.id,
    });

    return ctx.reply({
      content: [
        `Attribution #${award.id} créée pour <@${award.awardedToId}>.`,
        `Session : #${session.id} ${session.name}`,
        `Points : +${formatPoints(points)} | Total : ${formatPoints(score.points)}`,
      ].join("\n"),
      ephemeral: true,
    });
  },
});
