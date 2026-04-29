import { prisma } from "#/prisma/prisma";
import {
  buildButtonActionRow,
  buildClickableButton,
  buildContainer,
  buildSection,
  buildSeparator,
  buildTextDisplay,
  type ComponentInContainer,
  createButton,
  type TextDisplay,
} from "arcscord";
import { type InteractionReplyOptions, MessageFlags } from "discord.js";
import { GtcSessionMode, GtcSessionStatus } from "../../generated/prisma/enums";
import { findActiveSessionConflict, isSessionAdmin } from "../commands/session/helpers";
import { formatGtcSessionManagerRole, formatGtcSessionModeDetails, formatGtcSessionStatus } from "../utils/gtc_helpers";
import { sessionManagerModal } from "./session_manager_modal";

const sessionManageButtonMatcher = "button:sessionManage";

type ManageAction = "refresh" | "start" | "end" | "cancel" | "add_manager" | "remove_manager";
type SessionManageMessage = Pick<InteractionReplyOptions, "components" | "content"> & {
  flags?: MessageFlags.IsComponentsV2;
};

function formatDate(date: Date | null) {
  if (!date) {
    return "Non défini";
  }

  return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function actionLabel(action: ManageAction) {
  switch (action) {
    case "cancel":
      return "Annuler";
    case "end":
      return "Terminer";
    case "add_manager":
      return "Ajouter";
    case "refresh":
      return "Actualiser";
    case "remove_manager":
      return "Retirer";
    case "start":
      return "Démarrer";
  }
}

function actionStyle(action: ManageAction) {
  switch (action) {
    case "cancel":
      return "danger" as const;
    case "end":
      return "secondary" as const;
    case "add_manager":
      return "success" as const;
    case "refresh":
      return "primary" as const;
    case "remove_manager":
      return "danger" as const;
    case "start":
      return "success" as const;
  }
}

function isActionDisabled(action: ManageAction, status: GtcSessionStatus) {
  switch (action) {
    case "cancel":
      return status === GtcSessionStatus.ENDED || status === GtcSessionStatus.CANCELLED;
    case "end":
      return status !== GtcSessionStatus.ACTIVE;
    case "add_manager":
      return status === GtcSessionStatus.ENDED || status === GtcSessionStatus.CANCELLED;
    case "refresh":
      return false;
    case "remove_manager":
      return status === GtcSessionStatus.ENDED || status === GtcSessionStatus.CANCELLED;
    case "start":
      return status !== GtcSessionStatus.PLANNED;
  }
}

function buildManageButton(action: string, sessionId: string, userId: string, disabled: string) {
  return buildClickableButton({
    customId: `${sessionManageButtonMatcher}:${action}:${sessionId}:${userId}`,
    disabled: disabled === "true",
    label: actionLabel(action as ManageAction),
    style: actionStyle(action as ManageAction),
  });
}

function inContainer(component: ComponentInContainer) {
  return component;
}

function textInSection(component: TextDisplay) {
  return component;
}

export async function buildSessionManageMessage(sessionId: number, userId: string, notice?: string): Promise<SessionManageMessage> {
  const session = await prisma.gtcSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      guilds: {
        include: {
          guild: true,
        },
        orderBy: {
          joinedAt: "asc",
        },
      },
      invites: true,
      managers: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      organizerGuild: true,
      _count: {
        select: {
          originalMessages: true,
          participations: true,
          pointAwards: true,
          scores: true,
        },
      },
    },
  });

  if (!session) {
    return {
      components: [],
      content: "Session introuvable.",
    };
  }

  const activeInvites = session.invites.filter((invite) => {
    return !invite.revokedAt
      && (!invite.expiresAt || invite.expiresAt.getTime() > Date.now())
      && (invite.maxUses === null || invite.usedCount < invite.maxUses);
  });
  const servers = session.mode === GtcSessionMode.SINGLE_GUILD
    ? [session.organizerGuild.name]
    : [session.organizerGuild.name, ...session.guilds.map(sessionGuild => sessionGuild.guild.name)];
  const serverTitle = session.mode === GtcSessionMode.SINGLE_GUILD ? "Serveur" : "Serveurs";
  const controls = buildButtonActionRow(
    buildManageButton("start", String(session.id), userId, String(isActionDisabled("start", session.status))),
    buildManageButton("end", String(session.id), userId, String(isActionDisabled("end", session.status))),
    buildManageButton("cancel", String(session.id), userId, String(isActionDisabled("cancel", session.status))),
  );
  const managerControls = buildButtonActionRow(
    buildManageButton("add_manager", String(session.id), userId, String(isActionDisabled("add_manager", session.status))),
    buildManageButton("remove_manager", String(session.id), userId, String(isActionDisabled("remove_manager", session.status))),
  );
  const managerLines = session.managers.slice(0, 10).map((manager) => {
    const displayName = manager.user.globalName ?? manager.user.username;

    return `- <@${manager.userId}> (${displayName}) - ${formatGtcSessionManagerRole(manager.role)}`;
  });

  return {
    components: [
      buildContainer({
        accentColor: session.status === GtcSessionStatus.ACTIVE ? 0x2ECC71 : 0x3498DB,
        components: [
          inContainer(buildTextDisplay({
            content: [
              `## Session GTC #${session.id}`,
              `**${session.name}**`,
              notice ? `\n${notice}` : "",
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildSection({
            accessory: buildManageButton("refresh", String(session.id), userId, "false"),
            components: [
              textInSection(buildTextDisplay({
                content: [
                  `**Statut** : ${formatGtcSessionStatus(session.status)}`,
                  `**Mode** : ${formatGtcSessionModeDetails(session.mode)}`,
                  `**Serveur organisateur** : ${session.organizerGuild.name}`,
                ].join("\n"),
              }) as TextDisplay),
            ],
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              `**Démarrage** : ${formatDate(session.startedAt)}`,
              `**Fin** : ${formatDate(session.endedAt)}`,
              `**Points** : ${session.pointsEnabled ? `${session.pointsPerAward} par attribution` : "Désactivés"}`,
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              `**${serverTitle}** : ${servers.length}`,
              servers.slice(0, 8).map(server => `- ${server}`).join("\n"),
              servers.length > 8 ? `- +${servers.length - 8} autre(s)` : "",
            ].filter(Boolean).join("\n"),
          }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              `**Participants** : ${session._count.participations}`,
              `**Scores** : ${session._count.scores}`,
              `**Points attribués** : ${session._count.pointAwards}`,
              `**Messages originaux** : ${session._count.originalMessages}`,
              `**Invitations actives** : ${activeInvites.length}`,
              `**Administrateurs et organisateurs** : ${session.managers.length}`,
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              "**Administrateurs et organisateurs**",
              managerLines.length > 0 ? managerLines.join("\n") : "Aucun administrateur ou organisateur configuré",
              session.managers.length > managerLines.length ? `- +${session.managers.length - managerLines.length} autre(s)` : "",
            ].filter(Boolean).join("\n"),
          }) as ComponentInContainer),
          inContainer(managerControls),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(controls),
        ],
      }),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function startSession(sessionId: number) {
  const session = await prisma.gtcSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      guilds: true,
    },
  });
  if (!session) {
    return "Session introuvable.";
  }
  if (session.status !== GtcSessionStatus.PLANNED) {
    return "Seule une session planifiée peut être démarrée.";
  }

  const guildIds = [session.organizerGuildId, ...session.guilds.map(sessionGuild => sessionGuild.guildId)];
  for (const guildId of guildIds) {
    const conflict = await findActiveSessionConflict(guildId, session.id);
    if (conflict) {
      return `Impossible de démarrer : un serveur participe déjà à la session active **${conflict.name}** (#${conflict.id}).`;
    }
  }

  await prisma.gtcSession.update({
    where: {
      id: session.id,
    },
    data: {
      startedAt: new Date(),
      status: GtcSessionStatus.ACTIVE,
    },
  });

  return "Session démarrée.";
}

async function endSession(sessionId: number) {
  const session = await prisma.gtcSession.findUnique({
    where: {
      id: sessionId,
    },
  });
  if (!session) {
    return "Session introuvable.";
  }
  if (session.status !== GtcSessionStatus.ACTIVE) {
    return "Seule une session active peut être terminée.";
  }

  await prisma.gtcSession.update({
    where: {
      id: session.id,
    },
    data: {
      endedAt: new Date(),
      status: GtcSessionStatus.ENDED,
    },
  });

  return "Session terminée.";
}

async function cancelSession(sessionId: number) {
  const session = await prisma.gtcSession.findUnique({
    where: {
      id: sessionId,
    },
  });
  if (!session) {
    return "Session introuvable.";
  }
  if (session.status === GtcSessionStatus.ENDED || session.status === GtcSessionStatus.CANCELLED) {
    return "Cette session est déjà clôturée.";
  }

  await prisma.gtcSession.update({
    where: {
      id: session.id,
    },
    data: {
      endedAt: new Date(),
      status: GtcSessionStatus.CANCELLED,
    },
  });

  return "Session annulée.";
}

export const sessionManageButton = createButton({
  matcher: sessionManageButtonMatcher,
  build: buildManageButton,
  run: async (ctx) => {
    const [, , action, sessionId, userId] = ctx.customId.split(":");
    const parsedSessionId = Number.parseInt(sessionId ?? "", 10);
    if (!Number.isInteger(parsedSessionId)) {
      return ctx.reply("Session invalide.", { ephemeral: true });
    }
    if (ctx.user.id !== userId) {
      return ctx.reply("Seule la personne qui a ouvert ce panneau peut utiliser ces boutons.", { ephemeral: true });
    }
    if (!(await isSessionAdmin(parsedSessionId, ctx.user.id))) {
      return ctx.reply("Seul un administrateur de cette session peut utiliser ce panneau.", { ephemeral: true });
    }

    let notice: string | undefined;
    if (action === "start") {
      notice = await startSession(parsedSessionId);
    }
    else if (action === "end") {
      notice = await endSession(parsedSessionId);
    }
    else if (action === "cancel") {
      notice = await cancelSession(parsedSessionId);
    }
    else if (action === "refresh") {
      notice = `Panneau actualisé le <t:${Math.floor(Date.now() / 1000)}:f>.`;
    }
    else if (action === "add_manager") {
      return ctx.showModal(sessionManagerModal.build("add", String(parsedSessionId), ctx.user.id));
    }
    else if (action === "remove_manager") {
      return ctx.showModal(sessionManagerModal.build("remove", String(parsedSessionId), ctx.user.id));
    }
    else {
      return ctx.reply("Action inconnue.", { ephemeral: true });
    }

    return ctx.updateMessage(await buildSessionManageMessage(parsedSessionId, ctx.user.id, notice));
  },
});
