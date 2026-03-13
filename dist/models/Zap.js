import mongoose from 'mongoose';
const zapSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    zapierConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ZapierConnection', required: true },
    name: { type: String, required: true, trim: true },
    zapierZapId: { type: String, trim: true },
    triggerConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    actionConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
    hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },
    status: { type: String, default: 'active', enum: ['active', 'paused', 'off'] },
}, { timestamps: true });
zapSchema.index({ userId: 1 });
zapSchema.index({ zapierConnectionId: 1 });
export const Zap = mongoose.model('Zap', zapSchema);
