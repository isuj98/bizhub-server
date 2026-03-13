import mongoose from 'mongoose';
const hubSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sourceType: { type: String, required: true, enum: ['business', 'zap'] },
    sourceId: { type: mongoose.Schema.Types.Mixed, required: true },
    title: { type: String, required: true, trim: true },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    normalizedData: { type: mongoose.Schema.Types.Mixed, default: {} },
    analyzeReady: { type: Boolean, default: true },
}, { timestamps: true });
hubSchema.index({ userId: 1 });
hubSchema.index({ sourceType: 1, sourceId: 1 });
export const Hub = mongoose.model('Hub', hubSchema);
