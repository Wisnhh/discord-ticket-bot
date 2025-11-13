import mongoose from "mongoose";

const inviteStatSchema = new mongoose.Schema({
  guildId: String,
  inviterId: String,
  count: { type: Number, default: 0 }
}, { timestamps: true });

inviteStatSchema.index({ guildId: 1, inviterId: 1 }, { unique: true });

export default mongoose.models.InviteStat || mongoose.model("InviteStat", inviteStatSchema);
