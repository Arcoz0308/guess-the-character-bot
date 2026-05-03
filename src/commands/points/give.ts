import { createCommand } from "arcscord";
import { awardPoints, canManageSessionPoints, formatPoints, resolveActivePointSession } from "./helpers";

export const giveCommand = createCommand({
  build: {
    name: "give",
    description: "Attribuer des points à un joueur dans la session active",
    options: {
      joueur: {
        type: "user",
        description: "Joueur qui reçoit les points",
        required: true,
      },
      points: {
        type: "integer",
        description: "Nombre de points à attribuer",
        required: false,
        min_value: 1,
        max_value: 100,
      },
      raison: {
        type: "string",
        description: "Raison de l'attribution",
        required: false,
        max_length: 200,
      },
    } as const,
  },
  run: async (ctx) => {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.reply("Cette commande doit être utilisée dans un serveur.", { ephemeral: true });
    }

    const session = await resolveActivePointSession(guild);
    if (!session) {
      return ctx.reply("Aucune session active avec les points activés n'est liée à ce serveur.", { ephemeral: true });
    }
    if (!(await canManageSessionPoints(session.id, ctx.user.id))) {
      return ctx.reply("Seuls les administrateurs et organisateurs de cette session peuvent attribuer des points.", { ephemeral: true });
    }
    if (ctx.options.joueur.bot) {
      return ctx.reply("Impossible d'attribuer des points à un bot.", { ephemeral: true });
    }

    const points = ctx.options.points ?? session.pointsPerAward;
    const { award, score } = await awardPoints({
      guildId: guild.id,
      sessionId: session.id,
      user: ctx.options.joueur,
      awardedBy: ctx.user,
      points,
      reason: ctx.options.raison,
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
