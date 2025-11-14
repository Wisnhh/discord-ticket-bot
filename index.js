import fs from "fs";
import Invite from "./models/invite.js"; 
import mongoose from "mongoose";
import keepAlive from "./keep_alive.js";
keepAlive();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

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

const invitesCache = new Map();

async function getDiscordClient() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN not set");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.invitesCache = invitesCache;
  await client.login(token);
  return client;
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync("config.json", "utf8"));
  } catch {
    return {
      ticketCategoryId: "",
      logChannelId: "",
      setupChannelId: "",
      priceJasaChannelId: "",
      priceLockChannelId: "",
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
  } catch (err) {
    console.error("Error loading tickets:", err);
  }
  return {};
}

function saveTickets(tickets) {
  writeFileSync("tickets.json", JSON.stringify(tickets, null, 2));
}

let ticketCounter = 0;
const tickets = loadTickets();
if (Object.keys(tickets).length > 0) {
  ticketCounter = Math.max(...Object.values(tickets).map(t => t.ticketNumber || 0));
}

function sanitizeChannelName(input, fallback = "service") {
  if (!input) return fallback;
  let name = String(input)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return name || fallback;
}

async function createButtonPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🎫 Doughlas Ticket System")
    .setDescription(
      "Click a button:\n\n🎟️ Create Ticket\n🏆 Price Jasa\n🔒 Price Lock"
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("create_ticket").setLabel("Create Ticket").setStyle(ButtonStyle.Primary).setEmoji("🎟️"),
    new ButtonBuilder().setCustomId("price_jasa").setLabel("Price Jasa").setStyle(ButtonStyle.Success).setEmoji("🏆"),
    new ButtonBuilder().setCustomId("price_lock").setLabel("Price Lock").setStyle(ButtonStyle.Secondary).setEmoji("🔒"),
  );

  await channel.send({ embeds: [embed], components: [row] });
}

async function handleCreateTicket(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_modal")
    .setTitle("Create Ticket");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_subject")
        .setLabel("NAME WORLD")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_description")
        .setLabel("SERVICE")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("ticket_category")
        .setLabel("AMOUNT")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

const pendingTickets = new Map();
async function handleTicketModalSubmit(interaction) {
  const subject = interaction.fields.getTextInputValue("ticket_subject");
  const description = interaction.fields.getTextInputValue("ticket_description");
  const category = interaction.fields.getTextInputValue("ticket_category");

  const config = loadConfig();
  const guild = interaction.guild;

  const staffRoles = config.staffRoles || [];
  const availableRoles = guild.roles.cache
    .filter(r => staffRoles.includes(r.id))
    .map(r => ({ label: r.name, value: r.id }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_role_select")
    .setPlaceholder("Select staff role")
    .addOptions(availableRoles);

  pendingTickets.set(interaction.user.id, { subject, description, category });

  await interaction.reply({
    content: "Select which staff should handle your ticket:",
    components: [new ActionRowBuilder().addComponents(selectMenu)],
    flags: 64,
  });
}

async function handleRoleSelect(interaction) {
  const ticketData = pendingTickets.get(interaction.user.id);
  if (!ticketData)
    return interaction.reply({ content: "❌ Ticket expired.", flags: 64 });

  await interaction.deferUpdate();
  await interaction.editReply({ content: "Creating ticket...", components: [] });

  ticketCounter++;
  const guild = interaction.guild;
  const config = loadConfig();

  const ticketChannel = await guild.channels.create({
    name: `ticket-${sanitizeChannelName(ticketData.description)}-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId || null,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ]
  });

  const roleId = interaction.values[0];
  if (roleId !== "none") {
    ticketChannel.permissionOverwrites.create(roleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }

  pendingTickets.delete(interaction.user.id);

  await ticketChannel.send({
    content: roleId !== "none" ? `<@&${roleId}> new ticket!` : "",
    embeds: [
      new EmbedBuilder()
        .setColor("#00FF00")
        .setTitle(`🎫 Ticket #${ticketCounter}`)
        .addFields(
          { name: "World", value: ticketData.subject },
          { name: "Service", value: ticketData.description },
          { name: "Amount", value: ticketData.category },
        )
    ],
  });

  tickets[ticketChannel.id] = {
    ticketNumber: ticketCounter,
    userId: interaction.user.id,
    subject: ticketData.subject,
    description: ticketData.description,
    category: ticketData.category,
    status: "open",
  };
  saveTickets(tickets);

  await interaction.editReply({
    content: `Ticket created: <#${ticketChannel.id}>`,
    flags: 64,
  });
}

// CLAIM, CLOSE, ARCHIVE FUNCTION TETAP SAMA…
// (lanjutkan bagian CLOSE MODAL + ARSIP seperti file canvas sebelumnya)

// ================= BUTTON HANDLER ==================
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isButton()) {
      
      if (interaction.customId === "create_ticket")
        return handleCreateTicket(interaction);

      if (interaction.customId === "price_jasa") {
        const config = loadConfig();
        if (config.priceJasaChannelId) {
          return interaction.reply({
            content: `🏆 **PRICE JASA**\nSilakan cek: <#${config.priceJasaChannelId}>`,
            flags: 64,
          });
        }
        return interaction.reply({
          content: "Channel PRICE JASA belum diset! Gunakan: `!setpricejasa #channel`",
          flags: 64,
        });
      }

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
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_role_select")
        return handleRoleSelect(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket_modal")
        return handleTicketModalSubmit(interaction);
    }

  } catch (err) {
    console.error("Interaction error:", err);
  }
});
