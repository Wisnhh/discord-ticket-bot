import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  inviterId: { type: String, required: true },
  uses: { type: Number, default: 0 },
  guildId: { type: String, required: true },
  lastUsedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Export model (biar bisa dipanggil di index.js)
export default mongoose.models.Invite || mongoose.model("Invite", inviteSchema);
