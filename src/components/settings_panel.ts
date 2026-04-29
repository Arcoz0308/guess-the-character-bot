import { prisma } from "#/prisma/prisma";
import {
  buildButtonActionRow,
  buildChannelSelectMenu,
  buildClickableButton,
  buildContainer,
  buildLabel,
  buildModal,
  buildRoleSelectMenu,
  buildSeparator,
  buildTextDisplay,
  buildTextInput,
  type ComponentInContainer,
  createButton,
  createModal,
  createSelectMenu,
  type ModalContextValue,
} from "arcscord";
import { ChannelType, ComponentType, type Guild, type InteractionReplyOptions, MessageFlags } from "discord.js";
import { Prisma } from "../../generated/prisma/client";
import { upsertDiscordUser } from "../utils/gtc_helpers";

const settingsButtonMatcher = "button:settings";
const settingsChannelMatcher = "select:settingsChannel";
const settingsRoleMatcher = "select:settingsRole";
const settingsWebhookModalMatcher = "modal:settingsWebhook";

type SettingsAction = "refresh" | "create_webhook" | "set_webhook" | "toggle_deletion";
type SettingsMessage = Pick<InteractionReplyOptions, "components" | "content"> & {
  flags?: MessageFlags.IsComponentsV2;
};

function inContainer(component: ComponentInContainer) {
  return component;
}

function settingValue(value: string | null | undefined, empty = "Non configuré") {
  return value ? `\`${value}\`` : empty;
}

async function getBotChannelPermissionIssue(guild: Guild, channelId: string, requireWebhook = false) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return "Le salon sélectionné doit être un salon textuel.";
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has("ViewChannel")) {
    return "Le bot doit pouvoir lire le salon sélectionné.";
  }
  if (!permissions.has("SendMessages")) {
    return "Le bot doit pouvoir envoyer des messages dans le salon sélectionné.";
  }
  if (requireWebhook && !permissions.has("ManageWebhooks")) {
    return "Le bot doit avoir la permission de gérer les webhooks dans le salon sélectionné.";
  }

  return undefined;
}

function isValidWebhookUrl(value: string) {
  return /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/u.test(value);
}

function readStringValue(value: ModalContextValue | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function buildSettingsButton(action: string, guildId: string, userId: string) {
  const label = {
    create_webhook: "🔗 Créer webhook",
    refresh: "🔄 Actualiser",
    set_webhook: "✏️ URL webhook",
    toggle_deletion: "🗑️ Suppression orga",
  }[action as SettingsAction];
  const style = action === "toggle_deletion" ? "secondary" : "primary";

  return buildClickableButton({
    customId: `${settingsButtonMatcher}:${action}:${guildId}:${userId}`,
    label,
    style,
  });
}

async function upsertGuild(guild: { id: string; name: string }) {
  return prisma.guild.upsert({
    where: {
      id: guild.id,
    },
    update: {
      name: guild.name,
    },
    create: {
      id: guild.id,
      name: guild.name,
    },
  });
}

async function logSettingChange(guildId: string, changedById: string, key: string, oldValue: unknown, newValue: unknown) {
  await prisma.guildSettingChange.create({
    data: {
      changedById,
      guildId,
      key,
      newValue: newValue === undefined || newValue === null ? Prisma.JsonNull : newValue,
      oldValue: oldValue === undefined || oldValue === null ? Prisma.JsonNull : oldValue,
    },
  });
}

export async function buildSettingsPanel(guild: { id: string; name: string }, userId: string, notice?: string): Promise<SettingsMessage> {
  const guildSettings = await upsertGuild(guild);

  return {
    components: [
      buildContainer({
        accentColor: 0x3498DB,
        components: [
          inContainer(buildTextDisplay({
            content: [
              "## ⚙️ Paramètres GTC",
              `**Serveur**: ${guild.name}`,
              notice ? `\n${notice}` : "",
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              "## 📢 **Salon GTC**",
              guildSettings.channelId ? `### <#${guildSettings.channelId}>` : "# Non configuré",
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildChannelSelectMenu({
            channelTypes: ["guildText"],
            customId: `${settingsChannelMatcher}:${guild.id}:${userId}`,
            maxValues: 1,
            minValues: 1,
            placeholder: "Choisir le salon GTC",
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              "## 🔗 **Webhook**",
              `### ${settingValue(guildSettings.webhookUrl)}`,
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildButtonActionRow(
            buildSettingsButton("create_webhook", guild.id, userId),
            buildSettingsButton("set_webhook", guild.id, userId),
          )),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              "## 🔔 **Rôle ping GTC**",
              guildSettings.pingRoleId ? `### <@&${guildSettings.pingRoleId}>` : "### Non configuré",
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildRoleSelectMenu({
            customId: `${settingsRoleMatcher}:${guild.id}:${userId}`,
            maxValues: 1,
            minValues: 1,
            placeholder: "Choisir le rôle ping GTC",
          }) as ComponentInContainer),
          inContainer(buildSeparator({ spacing: "small" }) as ComponentInContainer),
          inContainer(buildTextDisplay({
            content: [
              "## 🗑️ **Suppression depuis le serveur organisateur**",
              guildSettings.allowOrganizerDeletion ? "### Activée" : "### Désactivée",
            ].join("\n"),
          }) as ComponentInContainer),
          inContainer(buildButtonActionRow(
            buildSettingsButton("toggle_deletion", guild.id, userId),
            buildSettingsButton("refresh", guild.id, userId),
          )),
        ],
      }),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function assertOwner(ctxUserId: string, ownerId: string) {
  if (ctxUserId !== ownerId) {
    return "Seule la personne qui a ouvert ce panneau peut utiliser ces composants.";
  }

  return undefined;
}

export const settingsChannelSelect = createSelectMenu({
  matcher: settingsChannelMatcher,
  type: ComponentType.ChannelSelect,
  build: (guildId, userId) => buildChannelSelectMenu({
    channelTypes: ["guildText"],
    customId: `${settingsChannelMatcher}:${guildId}:${userId}`,
    maxValues: 1,
    minValues: 1,
  }),
  run: async (ctx) => {
    const [, , guildId, ownerId] = ctx.customId.split(":");
    const guild = ctx.guild;
    if (!guild || guild.id !== guildId || !ownerId) {
      return ctx.reply("Configuration invalide.", { ephemeral: true });
    }

    const ownerError = await assertOwner(ctx.user.id, ownerId);
    if (ownerError) {
      return ctx.reply(ownerError, { ephemeral: true });
    }

    const channel = ctx.values[0];
    if (!channel || channel.type !== ChannelType.GuildText) {
      return ctx.reply("Le salon sélectionné doit être un salon textuel.", { ephemeral: true });
    }

    const permissionIssue = await getBotChannelPermissionIssue(guild, channel.id);
    if (permissionIssue) {
      return ctx.reply(permissionIssue, { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);
    const oldGuild = await upsertGuild(guild);
    await prisma.guild.update({
      where: {
        id: guild.id,
      },
      data: {
        channelId: channel.id,
      },
    });
    await logSettingChange(guild.id, ctx.user.id, "channelId", oldGuild.channelId, channel.id);

    return ctx.updateMessage(await buildSettingsPanel(guild, ownerId, "Salon GTC mis à jour."));
  },
});

export const settingsRoleSelect = createSelectMenu({
  matcher: settingsRoleMatcher,
  type: ComponentType.RoleSelect,
  build: (guildId, userId) => buildRoleSelectMenu({
    customId: `${settingsRoleMatcher}:${guildId}:${userId}`,
    maxValues: 1,
    minValues: 1,
  }),
  run: async (ctx) => {
    const [, , guildId, ownerId] = ctx.customId.split(":");
    const guild = ctx.guild;
    if (!guild || guild.id !== guildId || !ownerId) {
      return ctx.reply("Configuration invalide.", { ephemeral: true });
    }

    const ownerError = await assertOwner(ctx.user.id, ownerId);
    if (ownerError) {
      return ctx.reply(ownerError, { ephemeral: true });
    }

    const role = ctx.values[0];
    if (!role) {
      return ctx.reply("Rôle invalide.", { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);
    const oldGuild = await upsertGuild(guild);
    await prisma.guild.update({
      where: {
        id: guild.id,
      },
      data: {
        pingRoleId: role.id,
      },
    });
    await logSettingChange(guild.id, ctx.user.id, "pingRoleId", oldGuild.pingRoleId, role.id);

    return ctx.updateMessage(await buildSettingsPanel(guild, ownerId, "Rôle ping GTC mis à jour."));
  },
});

export const settingsWebhookModal = createModal({
  matcher: settingsWebhookModalMatcher,
  build: (guildId, userId) => buildModal(
    "Configurer le webhook",
    `${settingsWebhookModalMatcher}:${guildId}:${userId}`,
    buildLabel({
      label: "URL webhook",
      component: buildTextInput({
        customId: "webhookUrl",
        placeholder: "https://discord.com/api/webhooks/...",
        required: true,
        style: "short",
      }),
    }),
  ),
  run: async (ctx) => {
    const [, , guildId, ownerId] = ctx.customId.split(":");
    const guild = ctx.guild;
    if (!guild || guild.id !== guildId || !ownerId) {
      return ctx.reply("Configuration invalide.", { ephemeral: true });
    }

    const ownerError = await assertOwner(ctx.user.id, ownerId);
    if (ownerError) {
      return ctx.reply(ownerError, { ephemeral: true });
    }

    const webhookUrl = readStringValue(ctx.values.get("webhookUrl"))?.trim();
    if (!webhookUrl || !isValidWebhookUrl(webhookUrl)) {
      return ctx.reply("URL webhook invalide.", { ephemeral: true });
    }

    await upsertDiscordUser(ctx.user);
    const oldGuild = await upsertGuild(guild);
    await prisma.guild.update({
      where: {
        id: guild.id,
      },
      data: {
        webhookUrl,
      },
    });
    await logSettingChange(guild.id, ctx.user.id, "webhookUrl", oldGuild.webhookUrl, webhookUrl);

    return ctx.reply("URL webhook mise à jour.", { ephemeral: true });
  },
});

export const settingsButton = createButton({
  matcher: settingsButtonMatcher,
  build: buildSettingsButton,
  run: async (ctx) => {
    const [, , action, guildId, ownerId] = ctx.customId.split(":");
    const guild = ctx.guild;
    if (!guild || guild.id !== guildId || !ownerId) {
      return ctx.reply("Configuration invalide.", { ephemeral: true });
    }

    const ownerError = await assertOwner(ctx.user.id, ownerId);
    if (ownerError) {
      return ctx.reply(ownerError, { ephemeral: true });
    }

    if (action === "refresh") {
      return ctx.updateMessage(await buildSettingsPanel(guild, ownerId, `Panneau actualisé le <t:${Math.floor(Date.now() / 1000)}:f>.`));
    }

    if (action === "set_webhook") {
      return ctx.showModal(settingsWebhookModal.build(guild.id, ownerId));
    }

    if (action === "toggle_deletion") {
      await upsertDiscordUser(ctx.user);
      const oldGuild = await upsertGuild(guild);
      const newValue = !oldGuild.allowOrganizerDeletion;
      await prisma.guild.update({
        where: {
          id: guild.id,
        },
        data: {
          allowOrganizerDeletion: newValue,
        },
      });
      await logSettingChange(guild.id, ctx.user.id, "allowOrganizerDeletion", oldGuild.allowOrganizerDeletion, newValue);

      return ctx.updateMessage(await buildSettingsPanel(guild, ownerId, `Suppression organisateur ${newValue ? "activée" : "désactivée"}.`));
    }

    if (action === "create_webhook") {
      await upsertDiscordUser(ctx.user);
      const guildSettings = await upsertGuild(guild);
      if (!guildSettings.channelId) {
        return ctx.reply("Configure d'abord le salon GTC.", { ephemeral: true });
      }

      const permissionIssue = await getBotChannelPermissionIssue(guild, guildSettings.channelId, true);
      if (permissionIssue) {
        return ctx.reply(permissionIssue, { ephemeral: true });
      }

      const channel = await guild.channels.fetch(guildSettings.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return ctx.reply("Le salon GTC configuré est introuvable ou n'est pas textuel.", { ephemeral: true });
      }
      const webhook = await channel.createWebhook({
        name: "GTC Relay",
        reason: `Configuration GTC par ${ctx.user.tag}`,
      });
      await prisma.guild.update({
        where: {
          id: guild.id,
        },
        data: {
          webhookUrl: webhook.url,
        },
      });
      await logSettingChange(guild.id, ctx.user.id, "webhookUrl", guildSettings.webhookUrl, webhook.url);

      return ctx.updateMessage(await buildSettingsPanel(guild, ownerId, "Webhook créé et enregistré."));
    }

    return ctx.reply("Action inconnue.", { ephemeral: true });
  },
});
