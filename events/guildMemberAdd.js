export default async (client, member) => {
  console.log(`👋 Member join terdeteksi: ${member.user.tag}`);

  import Invite from "../models/invite.js";

export default async (client, member) => {
  const newInvites = await member.guild.invites.fetch();
  const cachedInvites = client.invites.get(member.guild.id);

  const usedInvite = newInvites.find(inv => cachedInvites.get(inv.code) < inv.uses);

  if (usedInvite) {
    await Invite.findOneAndUpdate(
      { code: usedInvite.code },
      {
        guildId: member.guild.id,
        inviterId: usedInvite.inviter?.id || "unknown",
        uses: usedInvite.uses,
      },
      { upsert: true }
    );

    console.log(`✅ Invite ${usedInvite.code} milik ${usedInvite.inviter?.tag} digunakan.`);
  }

  client.invites.set(member.guild.id, new Map(newInvites.map(i => [i.code, i.uses])));
};
