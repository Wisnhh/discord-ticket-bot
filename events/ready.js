import Invite from "../models/invite.js";

client.invites = new Map();

client.guilds.cache.forEach(async (guild) => {
  const invites = await guild.invites.fetch();

  // Simpan semua invite ke Mongo
  for (const invite of invites.values()) {
    await Invite.findOneAndUpdate(
      { code: invite.code },
      {
        guildId: guild.id,
        inviterId: invite.inviter?.id || "unknown",
        uses: invite.uses,
      },
      { upsert: true }
    );
  }

  // Simpan ke cache untuk perbandingan nanti
  client.invites.set(guild.id, new Map(invites.map((i) => [i.code, i.uses])));
});

console.log("✅ Invite cache diinisialisasi dan disimpan ke MongoDB");
