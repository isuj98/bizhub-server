import mongoose from 'mongoose';
const zapierConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, default: 'zapier', trim: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    scope: { type: String },
    connectedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'active', enum: ['active', 'revoked', 'expired'] },
    expiresAt: { type: Date },
    externalAccountId: { type: String },
}, { timestamps: true });
zapierConnectionSchema.index({ userId: 1 });
zapierConnectionSchema.index({ userId: 1, status: 1 });
export const ZapierConnection = mongoose.model('ZapierConnection', zapierConnectionSchema);
