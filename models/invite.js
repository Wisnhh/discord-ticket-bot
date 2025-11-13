import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema({
  code: { type: String, index: true },
  guildId: String,
  inviterId: String,
  uses: Number,
  lastUsedAt: Date
}, { timestamps: true });

export default mongoose.models.Invite || mongoose.model("Invite", inviteSchema);
