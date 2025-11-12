import keepAlive from "./keep_alive.js";
keepAlive();

// index.js
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

import {
  Client,
  GatewayIntentBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

async function getDiscordClient() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "DISCORD_BOT_TOKEN not found in environment variables. Please add your Discord bot token to Secrets.",
    );
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  await client.login(token);
  return client;
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync("config.json", "utf8"));
  } catch (error) {
    return {
      ticketCategoryId: "",
      logChannelId: "",
      setupChannelId: "",
      staffRoles: [],
      archiveChannelId: "",
    };
  }
}

function saveConfig(config) {
  writeFileSync("config.json", JSON.stringify(config, null, 2));
}

function loadTickets() {
  try {
    if (existsSync("tickets.json")) {
      return JSON.parse(readFileSync("tickets.json", "utf8"));
    }
  } catch (error) {
    console.error("Error loading tickets:", error);
  }
  return {};
}

function saveTickets(tickets) {
  writeFileSync("tickets.json", JSON.stringify(tickets, null, 2));
}

let ticketCounter = 0;
const tickets = loadTickets();

if (Object.keys(tickets).length > 0) {
  const ticketNumbers = Object.values(tickets).map((t) => t.ticketNumber || 0);
  ticketCounter = Math.max(0, ...ticketNumbers);
}

/* ---------- Helpers ---------- */

async function isInteractionMemberStaff(interaction) {
  const config = loadConfig();
  if (!interaction.guild) return false;
  // ensure member object
  let member = interaction.member;
  try {
    if (!member || !member.roles) {
      member = await interaction.guild.members.fetch(interaction.user.id);
    }
  } catch (err) {
    console.error("Failed fetching member for permission check:", err);
    return false;
  }
  if (!member) return false;
  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  return member.roles.cache.some((r) => staffRoles.includes(r.id));
}

function sanitizeChannelName(input, fallback = "service") {
  if (!input) return fallback;
  // Lowercase, replace spaces and invalid chars with hyphens, collapse multiple hyphens
  let name = String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9-_ ]+/g, "") // keep alnum, hyphen, underscore, space
    .trim()
    .replace(/\s+/g, "-") // spaces -> hyphen
    .replace(/-+/g, "-"); // collapse multiple hyphens
  if (!name) name = fallback;
  // Discord channel name max length ~100, keep safe margin
  if (name.length > 70) name = name.slice(0, 70);
  return name;
}

/* ---------- Panel / Modal / Ticket Creation ---------- */

async function createButtonPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🎫 Doughlas Ticket System")
    .setDescription(
      "Click one of the buttons below to get started order:\n\n🎟️ **Create Ticket** - Create a new support ticket\n🏆 **Price Jasa** - Service price information\n🔒 **Price Lock** - Price lock information",
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("create_ticket")
      .setLabel("Create Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎟️"),
    new ButtonBuilder()
      .setCustomId("price_jasa")
      .setLabel("Price Jasa")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🏆"),
    new ButtonBuilder()
      .setCustomId("price_lock")
      .setLabel("Price Lock")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔒"),
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function handleCreateTicket(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_modal")
    .setTitle("Create Support Ticket");

  const subjectInput = new TextInputBuilder()
    .setCustomId("ticket_subject")
    .setLabel("NAME WORLD")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Put Your World Name Here")
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("ticket_description")
    .setLabel("SERVICE")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Please Select The Service You Want To Buy")
    .setRequired(true)
    .setMaxLength(50);

  const categoryInput = new TextInputBuilder()
    .setCustomId("ticket_category")
    .setLabel("AMOUNT")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter The Amount You want To Buy")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subjectInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(categoryInput),
  );

  await interaction.showModal(modal);
}

const pendingTickets = new Map();

async function handleTicketModalSubmit(interaction) {
  const description =
    interaction.fields.getTextInputValue("ticket_description");
  const subject = interaction.fields.getTextInputValue("ticket_subject");
  const category = interaction.fields.getTextInputValue("ticket_category");

  const config = loadConfig();
  const guild = interaction.guild;

  const availableRoles = guild.roles.cache
    .filter(
      (role) =>
        !role.managed &&
        role.name !== "@everyone" &&
        config.staffRoles.includes(role.id),
    )
    .sort((a, b) => b.position - a.position)
    .map((role) => ({ label: role.name, value: role.id }));

  if (availableRoles.length === 0) {
    availableRoles.push({ label: "No Staff Roles Configured", value: "none" });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_role_select")
    .setPlaceholder("Select which staff role to notify")
    .addOptions(availableRoles.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(selectMenu);

  pendingTickets.set(interaction.user.id, { subject, description, category });

  await interaction.reply({
    content:
      "📋 **Almost done!** Please select which staff role should be notified about this ticket:",
    components: [row],
    ephemeral: true,
  });
}

async function handleRoleSelect(interaction) {
  const ticketData = pendingTickets.get(interaction.user.id);
  if (!ticketData) {
    return await interaction.reply({
      content: "❌ Ticket data not found. Please try creating a ticket again.",
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();
  await interaction.editReply({
    content: "⏳ Creating your ticket...",
    components: [],
  });

  const { subject, description, category } = ticketData;
  const selectedRoleId = interaction.values[0];

  ticketCounter++;

  const config = loadConfig();
  const guild = interaction.guild;

  let ticketCategory = null;
  if (config.ticketCategoryId) {
    ticketCategory = guild.channels.cache.get(config.ticketCategoryId);
  }

  // build sanitized channel name: ticket-<service>-<player>
  const serviceName = sanitizeChannelName(description, "service");
  // prefer nick if available
  let playerName = interaction.member?.nickname || interaction.user.username;
  playerName = sanitizeChannelName(playerName, "player");

  const channelName = `ticket-${serviceName}-${playerName}`;

  // create channel
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: ticketCategory?.id || null,
    topic: `Ticket #${ticketCounter} - ${subject}`,
    permissionOverwrites,
  });

  let roleMention = "";
  if (selectedRoleId && selectedRoleId !== "none") {
    const role = guild.roles.cache.get(selectedRoleId);
    if (role) {
      await ticketChannel.permissionOverwrites.create(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      roleMention = `<@&${role.id}>`;
    }
  }

  pendingTickets.delete(interaction.user.id);

  const ticketEmbed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle(`🎫 Ticket #${ticketCounter}`)
    .setDescription(
      `**World Name:** ${ticketData.subject}\n**Service:** ${ticketData.description}\n**Amount:** ${ticketData.category}`,
    )
    .addFields(
      { name: "Serc", value: description },
      { name: "Created by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Created at", value: new Date().toLocaleString(), inline: true },
    )
    .setTimestamp();

  if (roleMention)
    ticketEmbed.addFields({
      name: "Assigned Role",
      value: roleMention,
      inline: true,
    });

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✋"),
  );

  const message = roleMention
    ? `${roleMention} New ticket created by <@${interaction.user.id}>`
    : `<@${interaction.user.id}> Your ticket has been created!`;

  await ticketChannel.send({
    content: message,
    embeds: [ticketEmbed],
    components: [actionRow],
  });

  // store detailed ticket info
  tickets[ticketChannel.id] = {
    ticketNumber: ticketCounter,
    channelId: ticketChannel.id,
    userId: interaction.user.id,
    subject,
    description, // store service text so rename works reliably
    category,
    status: "open",
    createdAt: new Date().toISOString(),
    claimedBy: null,
  };
  saveTickets(tickets);

  if (config.logChannelId) {
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle("📝 New Ticket Created")
        .addFields(
          { name: "Ticket", value: `#${ticketCounter}`, inline: true },
          { name: "Channel", value: `<#${ticketChannel.id}>`, inline: true },
          { name: "User", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Subject", value: subject },
          { name: "Service", value: description, inline: true },
          { name: "Amount", value: category, inline: true },
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  await interaction.editReply({
    content: `✅ Your ticket has been created: <#${ticketChannel.id}>`,
    ephemeral: true,
  });
}

/* ---------- Claim & Close (permission-restricted) ---------- */

async function handleClaimTicket(interaction) {
  const config = loadConfig();
  // ensure member fetched & check staff permission
  const allowed = await isInteractionMemberStaff(interaction);
  if (!allowed) {
    return interaction.reply({
      content: "❌ You do not have permission to claim.",
      ephemeral: true,
    });
  }

  const ticketData = tickets[interaction.channel.id];
  if (!ticketData) {
    return interaction.reply({
      content: "❌ This is not a valid ticket channel.",
      ephemeral: true,
    });
  }

  if (ticketData.claimedBy) {
    return interaction.reply({
      content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>`,
      ephemeral: true,
    });
  }

  ticketData.claimedBy = interaction.user.id;
  ticketData.status = "in-progress";
  saveTickets(tickets);
  try {
    const serviceName = sanitizeChannelName(
      ticketData.description || "service",
    );
    const staffName =
      interaction.member?.nickname ||
      interaction.user.username ||
      `staff${interaction.user.id}`;
    const staffSan = sanitizeChannelName(staffName, "staff");
    const newName = `ticket-${serviceName}-${staffSan}`;

    await interaction.channel.setName(newName).catch((err) => {
      // ignore rename error but log
      console.error("Failed to rename ticket channel on claim:", err);
    });
  } catch (err) {
    console.error("Error while renaming channel on claim:", err);
  }

  const embed = new EmbedBuilder()
    .setColor("#FFA500")
    .setTitle("✋ Ticket Claimed")
    .setDescription(`This ticket is now handled by <@${interaction.user.id}>`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleCloseTicket(interaction) {
  const ticketData = tickets[interaction.channel.id];

  if (!ticketData) {
    return interaction.reply({
      content: "❌ This is not a valid ticket channel.",
      ephemeral: true,
    });
  }

  // Pastikan tiket sudah di-claim dulu
  if (!ticketData.claimedBy) {
    return interaction.reply({
      content: "❌ This ticket has not been claimed. Please claim it first before closing.",
      ephemeral: true,
    });
  }

  // Cek apakah user adalah claimer atau admin
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (ticketData.claimedBy !== interaction.user.id && !isAdmin) {
    return interaction.reply({
      content: `❌ Only the staff who claimed this ticket (<@${ticketData.claimedBy}>) or an Administrator can close it.`,
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId("close_modal")
    .setTitle("Close Ticket");

  const reasonInput = new TextInputBuilder()
    .setCustomId("close_reason")
    .setLabel("Resolution Notes")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Status Service")
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}
async function archiveTicketHistory(
  channel,
  ticketData,
  closedBy,
  closeReason,
  archiveChannel,
) {
  try {
    const messages = [];
    let lastMessageId;

    while (true) {
      const options = { limit: 100 };
      if (lastMessageId) options.before = lastMessageId;
      const fetchedMessages = await channel.messages.fetch(options);
      if (fetchedMessages.size === 0) break;
      messages.push(...fetchedMessages.values());
      lastMessageId = fetchedMessages.last().id;
      if (fetchedMessages.size < 100) break;
    }

    messages.reverse();

    let chatHistory = "";
    for (const msg of messages) {
    if (msg.author.bot && !msg.webhookId) continue;

      const timestamp = msg.createdAt.toLocaleString();
      const author = msg.author.username;
      const content = msg.content || "";

      if (!content.trim()) continue;

      chatHistory += `[${timestamp}] ${author}: ${content}\n`;
    }

    if (chatHistory.length === 0) chatHistory = "_No chat history available._";

    const archiveEmbed = new EmbedBuilder()
      .setColor("#ff3333")
      .setTitle(`📜 Ticket-${ticketData.subject} - Archive`)
      .addFields(
        { name: "Client", value: `<@${ticketData.userId}>`, inline: true },
        {
          name: "Admin",
          value: `<@${ticketData.claimedBy || closedBy}>`,
          inline: true,
        },
        {
          name: "World",
          value: ticketData.subject || "-",
          inline: true,
        },

        { name: "Service", value: ticketData.description || "-", inline: true },
        { name: "Amount", value: ticketData.category || "0", inline: true },
        { name: "Status", value: "Closed", inline: true },
        { name: "Closed at", value: new Date().toLocaleString(), inline: true },
        {
          name: "Note",
          value: closeReason || "No note provided",
          inline: false,
        },
        {
          name: "Chat History",
          value:
            "```" +
            (chatHistory.length > 1000
              ? chatHistory.slice(0, 1000) + "\n... (truncated)"
              : chatHistory) +
            "```",
        },
      )
      .setTimestamp();

    await archiveChannel.send({ embeds: [archiveEmbed] });
  } catch (error) {
    console.error("Error archiving ticket history:", error);
  }
}

async function handleCloseModalSubmit(interaction) {
  await interaction.deferReply();

  const reason =
    interaction.fields.getTextInputValue("close_reason") ||
    "No reason provided";
  const ticketData = tickets[interaction.channel.id];

  if (!ticketData) {
    return await interaction.editReply({
      content: "❌ This is not a valid ticket channel.",
    });
  }

  // Pastikan tiket sudah di-claim dulu
  if (!ticketData.claimedBy) {
    return await interaction.editReply({
      content: "❌ This ticket has not been claimed yet. Please claim it first before closing.",
    });
  }

  // Cek apakah user adalah claimer atau admin
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (ticketData.claimedBy !== interaction.user.id && !isAdmin) {
    return await interaction.editReply({
      content: `❌ Only the staff who claimed this ticket (<@${ticketData.claimedBy}>) or an Administrator can close it.`,
    });
  }

  ticketData.status = "closed";
  ticketData.closedBy = interaction.user.id;
  ticketData.closedAt = new Date().toISOString();
  ticketData.closeReason = reason;
  saveTickets(tickets);

  const closeEmbed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🔒 Ticket Closed")
    .setDescription(`This ticket has been closed by <@${interaction.user.id}>`)
    .addFields(
      { name: "Resolution Notes", value: reason },
      { name: "Closed at", value: new Date().toLocaleString() },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [closeEmbed] });

  const config = loadConfig();
  if (config.logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor("#FF0000")
        .setTitle("🔒 Ticket Closed")
        .addFields(
          { name: "Ticket", value: `#${ticketData.ticketNumber}`, inline: true },
          { name: "Channel", value: `<#${interaction.channel.id}>`, inline: true },
          { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Resolution", value: reason },
        )
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  if (config.archiveChannelId) {
    const archiveChannel = interaction.guild.channels.cache.get(config.archiveChannelId);
    if (archiveChannel) {
      await archiveTicketHistory(
        interaction.channel,
        ticketData,
        interaction.user.id,
        reason,
        archiveChannel,
      );
    }
  }

  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      delete tickets[interaction.channel.id];
      saveTickets(tickets);
    } catch (error) {
      console.error("Error deleting channel:", error);
    }
  }, 10000);
}

async function main() {
  console.log("🚀 Starting Discord Ticket Bot...");
  const client = await getDiscordClient();

  client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log("📝 Bot is ready to manage tickets!");
    console.log("\nAvailable commands:");
    console.log("  !setup - Send the ticket panel to this channel");
    console.log("  !setcategory <category_id> - Set the ticket category");
    console.log("  !setlog <channel_id> - Set the log channel");
    console.log(
      "  !setarchive <channel_id> - Set the archive channel for closed tickets",
    );
    console.log("  !addrole <@role> - Add a staff role for tickets");
    console.log("  !removerole <@role> - Remove a staff role");
    console.log("  !listroles - List all configured staff roles");
    console.log("  !setpricejasa <channel_id> - Set PRICE JASA info channel");
    console.log("  !setpricelock <channel_id> - Set PRICE LOCK info channel");
  });

  const invitesFile = "./invites.json";
const invitedByFile = "./invitedBy.json";
let invitesCache = new Map();

// 🔹 Fungsi load & save JSON
function loadJSON(file) {
  if (!existsSync(file)) writeFileSync(file, JSON.stringify({}));
  return JSON.parse(readFileSync(file, "utf8"));
}

function saveJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

  client.on("ready", async () => {
  console.log("✅ Invite Tracker aktif (auto add/remove)");
  for (const guild of client.guilds.cache.values()) {
    const invites = await guild.invites.fetch().catch(() => null);
    if (invites)
      invitesCache.set(guild.id, new Map(invites.map((i) => [i.code, i.uses])));
  }
});

  client.on("guildMemberAdd", async (member) => {
  const cachedInvites = invitesCache.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch().catch(() => null);
  if (!cachedInvites || !newInvites) return;

  const usedInvite = newInvites.find((inv) => cachedInvites.get(inv.code) < inv.uses);
  invitesCache.set(member.guild.id, new Map(newInvites.map((i) => [i.code, i.uses])));

  const invitesData = loadJSON(invitesFile);
  const invitedByData = loadJSON(invitedByFile);
  if (!invitesData[member.guild.id]) invitesData[member.guild.id] = {};
  if (!invitedByData[member.guild.id]) invitedByData[member.guild.id] = {};

  let inviterId = null;

  if (usedInvite && usedInvite.inviter) {
    inviterId = usedInvite.inviter.id;
    if (!invitesData[member.guild.id][inviterId])
      invitesData[member.guild.id][inviterId] = 0;
    invitesData[member.guild.id][inviterId]++;
    invitedByData[member.guild.id][member.id] = inviterId;
  }

  saveJSON(invitesFile, invitesData);
  saveJSON(invitedByFile, invitedByData);

    const configFile = "./config.json";
  const config = existsSync(configFile)
    ? JSON.parse(readFileSync(configFile, "utf8"))
    : {};
  const logChannelId = config.inviteLogChannelId;
  const logChannel = logChannelId ? member.guild.channels.cache.get(logChannelId) : null;

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setDescription(
      `👤 **${member.user.tag}** bergabung ke server!\n\n` +
        `🧭 **Diundang oleh:** ${
          inviterId ? `<@${inviterId}>` : "Tidak diketahui"
        }\n📈 **Total Invite:** ${
          inviterId ? invitesData[member.guild.id][inviterId] : "0"
        }`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "📥 Invite Tracker Log" })
    .setTimestamp();

  if (logChannel) logChannel.send({ embeds: [embed] });
});

  client.on("guildMemberRemove", async (member) => {
  const invitesData = loadJSON(invitesFile);
  const invitedByData = loadJSON(invitedByFile);
  if (!invitedByData[member.guild.id]) return;

  const inviterId = invitedByData[member.guild.id][member.id];
  if (!inviterId) return;
  if (invitesData[member.guild.id]?.[inviterId] > 0) {
    invitesData[member.guild.id][inviterId]--;
    saveJSON(invitesFile, invitesData);
  }

    delete invitedByData[member.guild.id][member.id];
  saveJSON(invitedByFile, invitedByData);

    const configFile = "./config.json";
  const config = existsSync(configFile)
    ? JSON.parse(readFileSync(configFile, "utf8"))
    : {};
  const logChannelId = config.inviteLogChannelId;
  const logChannel = logChannelId ? member.guild.channels.cache.get(logChannelId) : null;

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setDescription(
      `👋 **${member.user.tag}** telah keluar dari server.\n\n` +
        `📉 Invite milik <@${inviterId}> telah dikurangi.`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "📥 Invite Tracker Log" })
    .setTimestamp();

  if (logChannel) logChannel.send({ embeds: [embed] });
});

  client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith("!setinvitelog ")) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply("❌ Hanya Admin yang dapat mengatur channel log.");

    const channel = message.mentions.channels.first();
    if (!channel)
      return message.reply("❌ Gunakan format: `!setinvitelog #log-channel`");

    const configFile = "./config.json";
    const config = existsSync(configFile)
      ? JSON.parse(readFileSync(configFile, "utf8"))
      : {};

    config.inviteLogChannelId = channel.id;
    writeFileSync(configFile, JSON.stringify(config, null, 2));

    return message.reply(`✅ Channel log invite diatur ke ${channel}`);
  }

    if (message.content.startsWith("!invites")) {
    const member = message.mentions.members.first() || message.member;
    const invitesData = loadJSON(invitesFile);
    const count =
      invitesData[message.guild.id]?.[member.id] ||
      0;

    return message.reply(
      `📊 **${member.user.tag}** memiliki **${count}** total invite.`
    );
  }

    if (message.content === "!invcheck") {
    const invitesData = loadJSON(invitesFile);
    const count =
      invitesData[message.guild.id]?.[message.author.id] ||
      0;

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setDescription(
        `🧾 **${message.author.username}**, kamu telah mengundang **${count}** member ke server ini.`
      )
      .setFooter({ text: "📥 Invite Tracker" })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
});

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!setup") {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      await createButtonPanel(message.channel);
      return message.reply("✅ Ticket panel has been created!");
    }

    if (message.content.startsWith("!setcategory ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const categoryId = message.content.split(" ")[1];
      const config = loadConfig();
      config.ticketCategoryId = categoryId;
      saveConfig(config);
      return message.reply(`✅ Ticket category set to <#${categoryId}>`);
    }

    if (message.content.startsWith("!setlog ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const channelId = message.content.split(" ")[1];
      const config = loadConfig();
      config.logChannelId = channelId;
      saveConfig(config);
      return message.reply(`✅ Log channel set to <#${channelId}>`);
    }

    if (message.content.startsWith("!addrole ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const roleId = message.content.split(" ")[1].replace(/[<@&>]/g, "");
      const config = loadConfig();
      if (!config.staffRoles) config.staffRoles = [];
      if (config.staffRoles.includes(roleId))
        return message.reply(
          "❌ This role is already configured as a staff role.",
        );
      config.staffRoles.push(roleId);
      saveConfig(config);
      return message.reply(
        `✅ Staff role <@&${roleId}> added to ticket system.`,
      );
    }

    if (message.content.startsWith("!removerole ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const roleId = message.content.split(" ")[1].replace(/[<@&>]/g, "");
      const config = loadConfig();
      if (!config.staffRoles) config.staffRoles = [];
      const index = config.staffRoles.indexOf(roleId);
      if (index === -1)
        return message.reply("❌ This role is not configured as a staff role.");
      config.staffRoles.splice(index, 1);
      saveConfig(config);
      return message.reply(
        `✅ Staff role <@&${roleId}> removed from ticket system.`,
      );
    }
        if (message.content === "!ping") {
  return message.reply("**INI GW ON YA AJG**");
}

    if (message.content === "!listroles") {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const config = loadConfig();
      if (!config.staffRoles || config.staffRoles.length === 0)
        return message.reply(
          "❌ No staff roles configured. Use `!addrole <role_id>` to add one.",
        );
      const rolesList = config.staffRoles.map((id) => `<@&${id}>`).join(", ");
      return message.reply(`📋 **Configured Staff Roles:**\n${rolesList}`);
    }

    if (message.content.startsWith("!setpricejasa ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const channelId = message.content.split(" ")[1].replface(/[<#>]/g, "");
      const config = loadConfig();
      config.priceJasaChannelId = channelId;
      saveConfig(config);
      return message.reply(`✅ PRICE JASA channel set to <#${channelId}>`);
    }

    if (message.content.startsWith("!setpricelock ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const channelId = message.content.split(" ")[1].replace(/[<#>]/g, "");
      const config = loadConfig();
      config.priceLockChannelId = channelId;
      saveConfig(config);
      return message.reply(`✅ PRICE LOCK channel set to <#${channelId}>`);
    }

    if (message.content.startsWith("!setarchive ")) {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply(
          "❌ You need Administrator permission to use this command.",
        );
      const channelId = message.content.split(" ")[1].replace(/[<#>]/g, "");
      const config = loadConfig();
      config.archiveChannelId = channelId;
      saveConfig(config);
      return message.reply(`✅ Archive channel set to <#${channelId}>`);
    }

    if (message.content.startsWith("!setreactionrole ")) {
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
    return message.reply("❌ You need Administrator permission to use this command.");

  const args = message.content.split(" ");
  if (args.length < 4)
    return message.reply("❌ Usage: `!setreactionrole <emoji> <@role> <message>`");

  const emoji = args[1];
  const roleId = args[2].replace(/[<@&>]/g, "");
  const text = args.slice(3).join(" ");
  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("🎭 Reaction Role")
    .setDescription(`${text}\n\n> Tekan ${emoji} untuk mendapatkan role <@&${roleId}>`)
    .setFooter({ text: "Reaction Role System" });

  const sent = await message.channel.send({ embeds: [embed] });
  await sent.react(emoji);
  const file = "./reactionroles.json";
  let data = {};
  if (existsSync(file)) data = JSON.parse(readFileSync(file, "utf8"));
  data[sent.id] = { emoji, roleId };
  writeFileSync(file, JSON.stringify(data, null, 2));

  return message.reply(`✅ Reaction role panel berhasil dibuat! ID: **${sent.id}**`);
}

    if (message.content.startsWith("!addchat ")) {
  if (message.author.id !== message.guild.ownerId)
    return message.reply("❌ Hanya **owner server** yang bisa pakai command ini.");

  const text = message.content.slice("!addchat ".length).trim();
  if (!text)
    return message.reply("❌ Harap masukkan teks setelah command.");

  const fs = require("fs");
  const chatFile = "./chat.json";
  if (!fs.existsSync(chatFile)) fs.writeFileSync(chatFile, JSON.stringify({}));

  const data = JSON.parse(fs.readFileSync(chatFile, "utf8"));
  const chatId = Date.now().toString();
  data[chatId] = { text, guildId: message.guild.id };
  fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));

  const { EmbedBuilder } = require("discord.js");
  const embed = new EmbedBuilder()
    .setDescription(text)
    .setColor(0x2f3136)
    .setFooter({ text: `Chat ID: ${chatId}` });

  const sentMsg = await message.channel.send({ embeds: [embed] });
  return message.reply(`✅ Pesan panel berhasil dikirim dan disimpan!\n🆔 **Chat ID:** \`${chatId}\``);
}

    if (message.content.startsWith("!editchat ")) {
  if (message.author.id !== message.guild.ownerId)
    return message.reply("❌ Hanya **owner server** yang bisa pakai command ini.");

  const args = message.content.split(" ");
  const chatId = args[1];
  const newText = args.slice(2).join(" ");

  if (!chatId || !newText)
    return message.reply("❌ Gunakan format: `!editchat <chat_id> <teks_baru>`");

      const chatFile = "./chat.json";

      if (!fs.existsSync(chatFile))
    return message.reply("❌ Tidak ada file chat.json. Gunakan `!addchat` terlebih dahulu.");

  const data = JSON.parse(fs.readFileSync(chatFile, "utf8"));
  const chatData = data[chatId];

  if (!chatData)
    return message.reply("❌ Chat ID tidak ditemukan. Cek ID yang benar dengan pesan sebelumnya.");

  const channel = message.channel;
 const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
if (fetched) {
  const oldMsg = fetched.find(
    (m) => m.embeds.length > 0 && m.embeds[0].footer?.text?.includes(chatId)
  );
  if (oldMsg) await oldMsg.delete().catch(() => {});
}


  const newEmbed = new EmbedBuilder()
    .setDescription(newText)
    .setColor(0x2f3136)
    .setFooter({ text: `Chat ID: ${chatId}` });

  await message.channel.send({ embeds: [newEmbed] });

  data[chatId].text = newText;
  fs.writeFileSync(chatFile, JSON.stringify(data, null, 2));

  return message.reply(`✅ Pesan dengan ID \`${chatId}\` berhasil diperbarui.`);
}

    if (message.content === "!helpcmd") {
  const helpMessage = `
**🛠️ BOT COMMAND LIST**
> Berikut daftar command dan fungsinya:

📡 **Utility**
\`!ping\` — Mengecek apakah bot sedang online atau tidak.

🎟️ **Ticket System**
\`!setup\` — Membuat panel ticket.
\`!setcategory <category_id>\` — Mengatur kategori ticket.
\`!setlog <channel_id>\` — Mengatur log channel ticket.
\`!setarchive <channel_id>\` — Mengatur archive channel.
\`!addrole <@role>\` — Menambahkan staff role.
\`!removerole <@role>\` — Menghapus staff role.
\`!listroles\` — Menampilkan staff role yang terdaftar.

💰 **Channel Setting**
\`!setpricejasa <#channel>\` — Mengatur channel Price Jasa.
\`!setpricelock <#channel>\` — Mengatur channel Price Lock.

🎭 **Reaction Role**
\`!setreactionrole <message_id> <emoji> <@role>\` — Menambahkan reaction role otomatis.

💬 **Chat Commands (Owner Only)**
\`!addchat <text>\` — Mengirim pesan publik (embed panel).
\`!editchat <new_text>\` — Mengedit pesan publik sebelumnya.

📥 **Invite Tracker**
\`!setinvitelog <#channel>\` — Mengatur channel log untuk invite tracker.
\`!invcheck\` — Menampilkan total jumlah member yang kamu undang.

ℹ️ **Informasi**
\`!helpcmd\` — Menampilkan daftar semua command dan fungsinya.
`;

  return message.reply(helpMessage);
  }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (interaction.customId === "create_ticket") {
          return await handleCreateTicket(interaction);
        } else if (
          interaction.customId === "price_jasa" ||
          interaction.customId === "price_jasa"
        ) {
          const config = loadConfig();
          if (config.priceJasaChannelId) {
            return interaction.reply({
              content: `🏆 **PRICE JASA**\n\nFor service price information, please check: <#${config.priceJasaChannelId}>`,
              ephemeral: true,
            });
          } else {
            return interaction.reply({
              content:
                "🏆 **PRICE JASA**\n\nService price channel not configured yet.\nAsk an administrator to set it up with `!setpricejasa <channel_id>`",
              ephemeral: true,
            });
          }
        } else if (interaction.customId === "price_lock") {
          const config = loadConfig();
          if (config.priceLockChannelId) {
            return interaction.reply({
              content: `🔒 **PRICE LOCK**\n\nFor price lock information, please check: <#${config.priceLockChannelId}>`,
              ephemeral: true,
            });
          } else {
            return interaction.reply({
              content:
                "🔒 **PRICE LOCK**\n\nPrice lock channel not configured yet.\nAsk an administrator to set it up with `!setpricelock <channel_id>`",
              ephemeral: true,
            });
          }
        } else if (interaction.customId === "close_ticket") {
          return await handleCloseTicket(interaction);
        } else if (interaction.customId === "claim_ticket") {
          return await handleClaimTicket(interaction);
        }
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "ticket_role_select")
          return await handleRoleSelect(interaction);
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId === "ticket_modal")
          return await handleTicketModalSubmit(interaction);
        if (interaction.customId === "close_modal")
          return await handleCloseModalSubmit(interaction);
      }
    } catch (error) {
      console.error("Error handling interaction:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ An error occurred. Please try again.",
            ephemeral: true,
          });
        }
      } catch (err) {
        console.error("Failed to send error reply to interaction:", err);
      }
    }
  });

  // ==================================================
// 🎭 REACTION ROLE EVENT LISTENER
// ==================================================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  const file = "./reactionroles.json";
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, "utf8"));

  const info = data[reaction.message.id];
  if (!info) return;
  if (reaction.emoji.name !== info.emoji) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  if (!member.roles.cache.has(info.roleId)) {
    await member.roles.add(info.roleId).catch(console.error);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;

  const file = "./reactionroles.json";
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, "utf8"));

  const info = data[reaction.message.id];
  if (!info) return;
  if (reaction.emoji.name !== info.emoji) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  if (member.roles.cache.has(info.roleId)) {
    await member.roles.remove(info.roleId).catch(console.error);
  }
});

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
  });
}

main().catch(console.error);
