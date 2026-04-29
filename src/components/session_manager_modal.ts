import { prisma } from "#/prisma/prisma";
import {
  buildLabel,
  buildModal,
  buildRadioGroup,
  buildUserSelectModalComponent,
  createModal,
  type ModalContextValue,
} from "arcscord";
import { GtcSessionManagerRole } from "../../generated/prisma/enums";
import { isSessionAdmin } from "../commands/session/helpers";
import { formatGtcSessionManagerRole, upsertDiscordUser } from "../utils/gtc_helpers";

const sessionManagerModalMatcher = "modal:sessionManager";

function readSelectedUserId(value: ModalContextValue | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function readRole(value: ModalContextValue | undefined) {
  const role = readSelectedUserId(value);
  if (role === GtcSessionManagerRole.ADMIN || role === GtcSessionManagerRole.ORGANIZER) {
    return role;
  }

  return undefined;
}

async function assertCanManage(sessionId: number, requesterId: string, ownerId: string) {
  if (requesterId !== ownerId) {
    return "Seule la personne qui a ouvert ce panneau peut utiliser cette action.";
  }

  if (!(await isSessionAdmin(sessionId, requesterId))) {
    return "Seul un administrateur de cette session peut gérer les administrateurs et organisateurs.";
  }

  return undefined;
}

export const sessionManagerModal = createModal({
  matcher: sessionManagerModalMatcher,
  build: (action, sessionId, userId) => buildModal(
    action === "add" ? "Ajouter un administrateur ou organisateur" : "Retirer un administrateur ou organisateur",
    `${sessionManagerModalMatcher}:${action}:${sessionId}:${userId}`,
    buildLabel({
      label: "Utilisateur",
      component: buildUserSelectModalComponent({
        customId: "managerUser",
        maxValues: 1,
        minValues: 1,
        required: true,
      }),
    }),
    ...(action === "add"
      ? [
          buildLabel({
            label: "Rôle",
            component: buildRadioGroup({
              customId: "managerRole",
              options: [
                {
                  label: "Administrateur",
                  value: GtcSessionManagerRole.ADMIN,
                  description: "Peut gérer la session, les administrateurs et les organisateurs.",
                },
                {
                  label: "Organisateur",
                  value: GtcSessionManagerRole.ORGANIZER,
                  description: "Peut envoyer les messages du serveur organisateur relayés par le bot.",
                  default: true,
                },
              ],
              required: true,
            }),
          }),
        ]
      : []),
  ),
  run: async (ctx) => {
    const [, , action, sessionId, ownerId] = ctx.customId.split(":");
    const parsedSessionId = Number.parseInt(sessionId ?? "", 10);
    if (!Number.isInteger(parsedSessionId) || !ownerId) {
      return ctx.reply("Action invalide.", { ephemeral: true });
    }

    const permissionError = await assertCanManage(parsedSessionId, ctx.user.id, ownerId);
    if (permissionError) {
      return ctx.reply(permissionError, { ephemeral: true });
    }

    const selectedUserId = readSelectedUserId(ctx.values.get("managerUser"));
    if (!selectedUserId) {
      return ctx.reply("Utilisateur invalide.", { ephemeral: true });
    }

    if (action === "add") {
      const role = readRole(ctx.values.get("managerRole"));
      if (!role) {
        return ctx.reply("Rôle invalide.", { ephemeral: true });
      }

      const user = await ctx.client.users.fetch(selectedUserId);
      await upsertDiscordUser(user);
      await prisma.gtcSessionManager.upsert({
        where: {
          sessionId_userId_role: {
            role,
            sessionId: parsedSessionId,
            userId: selectedUserId,
          },
        },
        update: {},
        create: {
          guildId: ctx.guildId,
          role,
          sessionId: parsedSessionId,
          userId: selectedUserId,
        },
      });

      return ctx.reply(`<@${selectedUserId}> a été ajouté comme ${formatGtcSessionManagerRole(role)}.`, { ephemeral: true });
    }

    if (action === "remove") {
      const targetRoles = await prisma.gtcSessionManager.findMany({
        where: {
          sessionId: parsedSessionId,
          userId: selectedUserId,
        },
      });
      if (targetRoles.length === 0) {
        return ctx.reply("Cet utilisateur n'est ni administrateur ni organisateur de cette session.", { ephemeral: true });
      }

      const removesAdmin = targetRoles.some(manager => manager.role === GtcSessionManagerRole.ADMIN);
      if (removesAdmin) {
        const adminCount = await prisma.gtcSessionManager.count({
          where: {
            role: GtcSessionManagerRole.ADMIN,
            sessionId: parsedSessionId,
          },
        });
        if (adminCount <= 1) {
          return ctx.reply("Impossible de retirer le dernier administrateur de la session.", { ephemeral: true });
        }
      }

      await prisma.gtcSessionManager.deleteMany({
        where: {
          sessionId: parsedSessionId,
          userId: selectedUserId,
        },
      });

      return ctx.reply(`<@${selectedUserId}> n'est plus administrateur ni organisateur de cette session.`, { ephemeral: true });
    }

    return ctx.reply("Action inconnue.", { ephemeral: true });
  },
});
