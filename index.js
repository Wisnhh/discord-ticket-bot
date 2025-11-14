// ======================= IMPORTS ==========================
import fs, { readFileSync, writeFileSync, existsSync } from "fs";
import Invite from "./models/invite.js";
import mongoose from "mongoose";
import keepAlive from "./keep_alive.js";

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
  StringSelectMenuBuilder
} from "discord.js";

// ======================= KEEP ALIVE ==========================
keepAlive();

// ======================= MONGODB INIT ==========================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

process.on("unhandledRejection", err => {
  console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught exception:", err);
});


// ======================= GLOBAL CACHE ==========================
const invitesCache = new Map();


// ======================= DISCORD CLIENT ==========================
async function getDiscordClient() {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "DISCORD_BOT_TOKEN not found. Please add your bot token to Railway Secrets."
    );
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.invitesCache = invitesCache;
  await client.login(token);

  return client;
}


// ======================= CONFIG SYSTEM ==========================
function loadConfig() {
  try {
    return JSON.parse(readFileSync("config.json", "utf8"));
  } catch (err) {
    return {
      ticketCategoryId: "",
      logChannelId: "",
      setupChannelId: "",
      staffRoles: [],
      archiveChannelId: "",
      priceJasaChannelId: "",
      priceLockChannelId: "",
      inviteLogChannelId: ""
    };
  }
}

function saveConfig(config) {
  writeFileSync("config.json", JSON.stringify(config, null, 2));
}


// ======================= TICKET STORAGE ==========================
function loadTickets() {
  try {
    if (existsSync("tickets.json")) {
      return JSON.parse(readFileSync("tickets.json", "utf8"));
    }
  } catch (err) {
    console.error("Error loading tickets:", err);
  }
  return {};
}

function saveTickets(data) {
  writeFileSync("tickets.json", JSON.stringify(data, null, 2));
}

let ticketCounter = 0;
const tickets = loadTickets();

// Sync ticket counter
if (Object.keys(tickets).length > 0) {
  const nums = Object.values(tickets).map(t => t.ticketNumber || 0);
  ticketCounter = Math.max(0, ...nums);
}


// ======================= STAFF CHECK ==========================
async function isInteractionMemberStaff(interaction) {
  const config = loadConfig();
  const guild = interaction.guild;

  if (!guild) return false;

  let member = interaction.member;

  try {
    if (!member || !member.roles) {
      member = await guild.members.fetch(interaction.user.id);
    }
  } catch (err) {
    console.error("Failed to fetch member for staff check:", err);
    return false;
  }

  if (!member) return false;

  const staffRoles = Array.isArray(config.staffRoles) ? config.staffRoles : [];
  return member.roles.cache.some(role => staffRoles.includes(role.id));
}


// ======================= SAFE CHANNEL NAME ==========================
function sanitizeChannelName(input, fallback = "service") {
  if (!input) return fallback;

  let name = String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  if (!name) name = fallback;
  if (name.length > 70) name = name.slice(0, 70);

  return name;
}


// ======================= TICKET PANEL ==========================
async function createButtonPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🎫 Doughlas Ticket System")
    .setDescription(
      "Click one of the buttons below:\n\n" +
      "🎟️ **Create Ticket**\n" +
      "🏆 **Price Jasa**\n" +
      "🔒 **Price Lock**"
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
      .setEmoji("🔒")
  );

  await channel.send({
    embeds: [embed],
    components: [row]
  });
}
// ======================= CREATE TICKET MODAL ==========================
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

  const amountInput = new TextInputBuilder()
    .setCustomId("ticket_category")
    .setLabel("AMOUNT")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter The Amount You Want To Buy")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(subjectInput),
    new ActionRowBuilder().addComponents(descriptionInput),
    new ActionRowBuilder().addComponents(amountInput)
  );

  await interaction.showModal(modal);
}


// ======================= PENDING TICKET STORAGE ==========================
const pendingTickets = new Map();


// ======================= HANDLE MODAL SUBMIT ==========================
async function handleTicketModalSubmit(interaction) {
  const subject = interaction.fields.getTextInputValue("ticket_subject");
  const description = interaction.fields.getTextInputValue("ticket_description");
  const amount = interaction.fields.getTextInputValue("ticket_category");

  const guild = interaction.guild;
  const config = loadConfig();

  const staffRoles = guild.roles.cache
    .filter(role =>
      !role.managed &&
      role.name !== "@everyone" &&
      config.staffRoles.includes(role.id)
    )
    .sort((a, b) => b.position - a.position)
    .map(role => ({ label: role.name, value: role.id }));

  if (staffRoles.length === 0) {
    staffRoles.push({
      label: "No Staff Roles Configured",
      value: "none"
    });
  }

  const roleMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_role_select")
    .setPlaceholder("Select which staff role to notify")
    .addOptions(staffRoles.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(roleMenu);

  pendingTickets.set(interaction.user.id, {
    subject,
    description,
    category: amount
  });

  await interaction.reply({
    content:
      "📋 **Almost done!** Please select which staff role should be notified for this ticket:",
    components: [row],
    ephemeral: true
  });
}


// ======================= HANDLE ROLE SELECT ==========================
async function handleRoleSelect(interaction) {
  const data = pendingTickets.get(interaction.user.id);

  if (!data) {
    return interaction.reply({
      content: "❌ Ticket data not found. Please try again.",
      ephemeral: true
    });
  }

  await interaction.deferUpdate();
  await interaction.editReply({
    content: "⏳ Creating your ticket...",
    components: []
  });

  const guild = interaction.guild;
  const config = loadConfig();
  const selectedRoleId = interaction.values[0];
  const { subject, description, category } = data;

  ticketCounter++;

  let ticketCategory = null;
  if (config.ticketCategoryId) {
    ticketCategory = guild.channels.cache.get(config.ticketCategoryId);
  }

  const serviceName = sanitizeChannelName(description, "service");
  const username =
    sanitizeChannelName(
      interaction.member?.nickname || interaction.user.username,
      "player"
    );

  const channelName = `ticket-${serviceName}-${username}`;

  const perms = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: ticketCategory?.id || null,
    topic: `Ticket #${ticketCounter} - ${subject}`,
    permissionOverwrites: perms
  });

  let roleMention = "";
  if (selectedRoleId !== "none") {
    const role = guild.roles.cache.get(selectedRoleId);
    if (role) {
      await ticketChannel.permissionOverwrites.create(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      roleMention = `<@&${role.id}>`;
    }
  }

  pendingTickets.delete(interaction.user.id);

  const ticketEmbed = new EmbedBuilder()
    .setColor("#00FF00")
    .setTitle(`🎫 Ticket #${ticketCounter}`)
    .setDescription(
      `**World Name:** ${subject}\n` +
      `**Service:** ${description}\n` +
      `**Amount:** ${category}`
    )
    .addFields(
      { name: "Service", value: description },
      { name: "Created by", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Created at", value: new Date().toLocaleString(), inline: true }
    )
    .setTimestamp();

  if (roleMention) {
    ticketEmbed.addFields({
      name: "Assigned Role",
      value: roleMention,
      inline: true
    });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),

    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✋")
  );

  const notifyMessage = roleMention
    ? `${roleMention} New ticket created by <@${interaction.user.id}>`
    : `<@${interaction.user.id}> Your ticket has been created!`;

  await ticketChannel.send({
    content: notifyMessage,
    embeds: [ticketEmbed],
    components: [buttons]
  });


  // SAVE TICKET
  tickets[ticketChannel.id] = {
    ticketNumber: ticketCounter,
    channelId: ticketChannel.id,
    userId: interaction.user.id,
    subject,
    description,
    category,
    status: "open",
    createdAt: new Date().toISOString(),
    claimedBy: null
  };

  saveTickets(tickets);


  // LOG TICKET
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
          { name: "Amount", value: category, inline: true }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed] });
    }
  }

  await interaction.editReply({
    content: `✅ Your ticket has been created: <#${ticketChannel.id}>`,
    ephemeral: true
  });
}
// ======================= CLAIM TICKET ==========================
async function handleClaimTicket(interaction) {
  const allowed = await isInteractionMemberStaff(interaction);

  if (!allowed) {
    return interaction.reply({
      content: "❌ You do not have permission to claim.",
      flags: 64
    });
  }

  const ticketData = tickets[interaction.channel.id];
  if (!ticketData) {
    return interaction.reply({
      content: "❌ This is not a valid ticket channel.",
      flags: 64
    });
  }

  if (ticketData.claimedBy) {
    return interaction.reply({
      content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>`,
      flags: 64
    });
  }

  ticketData.claimedBy = interaction.user.id;
  ticketData.status = "in-progress";
  saveTickets(tickets);

  try {
    const serviceName = sanitizeChannelName(ticketData.description || "service");
    const staffName = sanitizeChannelName(
      interaction.member?.nickname || interaction.user.username || "staff",
      "staff"
    );

    await interaction.channel
      .setName(`ticket-${serviceName}-${staffName}`)
      .catch(() => {});
  } catch (err) {
    console.error("Channel rename failed:", err);
  }

  const embed = new EmbedBuilder()
    .setColor("#FFA500")
    .setTitle("✋ Ticket Claimed")
    .setDescription(`This ticket is now handled by <@${interaction.user.id}>`)
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}



// ======================= CLOSE TICKET (OPEN MODAL) ==========================
async function handleCloseTicket(interaction) {
  const ticketData = tickets[interaction.channel.id];

  if (!ticketData) {
    return interaction.reply({
      content: "❌ This is not a valid ticket channel.",
      flags: 64
    });
  }

  if (!ticketData.claimedBy) {
    return interaction.reply({
      content: "❌ This ticket has not been claimed yet.",
      flags: 64
    });
  }

  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (ticketData.claimedBy !== interaction.user.id && !isAdmin) {
    return interaction.reply({
      content: `❌ Only <@${ticketData.claimedBy}> or an Admin can close this ticket.`,
      flags: 64
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



// ======================= ARCHIVE HISTORY ==========================
async function archiveTicketHistory(channel, ticketData, closedBy, closeReason, archiveChannel) {
  try {
    const messages = [];
    let lastMessageId = null;

    while (true) {
      const fetched = await channel.messages.fetch({
        limit: 100,
        before: lastMessageId || undefined
      });

      if (fetched.size === 0) break;

      messages.push(...fetched.values());
      lastMessageId = fetched.last().id;
    }

    messages.reverse();

    let history = "";
    for (const msg of messages) {
      if (msg.author.bot && !msg.webhookId) continue;
      if (!msg.content.trim()) continue;

      const time = msg.createdAt.toLocaleString();
      const author = msg.author.username;

      history += `[${time}] ${author}: ${msg.content}\n`;
    }

    if (!history) history = "_No chat history available._";

    const embed = new EmbedBuilder()
      .setColor("#ff3333")
      .setTitle(`📜 Ticket-${ticketData.subject} - Archive`)
      .addFields(
        { name: "Client", value: `<@${ticketData.userId}>`, inline: true },
        { name: "Admin", value: `<@${ticketData.claimedBy || closedBy}>`, inline: true },
        { name: "World", value: ticketData.subject || "-", inline: true },
        { name: "Service", value: ticketData.description || "-" },
        { name: "Amount", value: ticketData.category || "0" },
        { name: "Status", value: "Closed", inline: true },
        { name: "Closed at", value: new Date().toLocaleString(), inline: true },
        { name: "Note", value: closeReason || "No note provided" },
        {
          name: "Chat History",
          value:
            "```" +
            (history.length > 1000
              ? history.slice(0, 1000) + "\n... (truncated)"
              : history) +
            "```"
        }
      )
      .setTimestamp();

    await archiveChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Archive error:", err);
  }
}



// ======================= CLOSE MODAL SUBMIT ==========================
async function handleCloseModalSubmit(interaction) {
  await interaction.deferReply();

  const reason =
    interaction.fields.getTextInputValue("close_reason") ||
    "No reason provided";

  const ticketData = tickets[interaction.channel.id];

  if (!ticketData) {
    return interaction.editReply({
      content: "❌ This is not a valid ticket channel."
    });
  }

  if (!ticketData.claimedBy) {
    return interaction.editReply({
      content: "❌ This ticket has not been claimed yet."
    });
  }

  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  if (ticketData.claimedBy !== interaction.user.id && !isAdmin) {
    return interaction.editReply({
      content: `❌ Only <@${ticketData.claimedBy}> or an Admin can close this ticket.`
    });
  }

  ticketData.status = "closed";
  ticketData.closedBy = interaction.user.id;
  ticketData.closedAt = new Date().toISOString();
  ticketData.closeReason = reason;

  saveTickets(tickets);

  const embed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🔒 Ticket Closed")
    .setDescription(`This ticket has been closed by <@${interaction.user.id}>`)
    .addFields(
      { name: "Resolution Notes", value: reason },
      { name: "Closed at", value: new Date().toLocaleString() }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  const config = loadConfig();

  // LOG CHANNEL
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
          { name: "Resolution", value: reason }
        )
        .setTimestamp();
      logChannel.send({ embeds: [logEmbed] });
    }
  }

  // ARCHIVE
  if (config.archiveChannelId) {
    const archiveChannel =
      interaction.guild.channels.cache.get(config.archiveChannelId);

    if (archiveChannel) {
      await archiveTicketHistory(
        interaction.channel,
        ticketData,
        interaction.user.id,
        reason,
        archiveChannel
      );
    }
  }

  // DELETE CHANNEL
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      delete tickets[interaction.channel.id];
      saveTickets(tickets);
    } catch (err) {
      console.error("Error deleting channel:", err);
    }
  }, 10000);
}
// ======================= INTERACTION HANDLER ==========================
client.on("interactionCreate", async (interaction) => {
  try {
    // ================= BUTTON ==================
    if (interaction.isButton()) {

      // CREATE TICKET
      if (interaction.customId === "create_ticket") {
        return await handleCreateTicket(interaction);
      }

      // PRICE JASA BUTTON
      if (interaction.customId === "price_jasa") {
        const config = loadConfig();
        if (config.priceJasaChannelId) {
          return interaction.reply({
            content: `🏆 **PRICE JASA**\nSilakan cek: <#${config.priceJasaChannelId}>`,
            flags: 64, // ephemeral replacement
          });
        }
        return interaction.reply({
          content: "Channel PRICE JASA belum diset! Gunakan: `!setpricejasa #channel`",
          flags: 64,
        });
      }

      // PRICE LOCK BUTTON
      if (interaction.customId === "price_lock") {
        const config = loadConfig();
        if (config.priceLockChannelId) {
          return interaction.reply({
            content: `🔒 **PRICE LOCK**\nSilakan cek: <#${config.priceLockChannelId}>`,
            flags: 64,
          });
        }
        return interaction.reply({
          content: "Channel PRICE LOCK belum diset! Gunakan: `!setpricelock #channel`",
          flags: 64,
        });
      }

      // CLAIM TICKET
      if (interaction.customId === "claim_ticket") {
        return await handleClaimTicket(interaction);
      }

      // CLOSE TICKET
      if (interaction.customId === "close_ticket") {
        return await handleCloseTicket(interaction);
      }
    }

    // ================= SELECT MENU ==================
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_role_select") {
        return await handleRoleSelect(interaction);
      }
    }

    // ================= MODAL SUBMIT ==================
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket_modal") {
        return await handleTicketModalSubmit(interaction);
      }
      if (interaction.customId === "close_modal") {
        return await handleCloseModalSubmit(interaction);
      }
    }

  } catch (error) {
    console.error("Error handling interaction:", error);

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred. Please try again.",
          flags: 64,
        });
      }
    } catch (err) {
      console.error("Failed to send error reply:", err);
    }
  }
});
