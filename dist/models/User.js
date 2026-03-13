import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user', trim: true },
}, { timestamps: true });
userSchema.index({ email: 1 });
export const User = mongoose.model('User', userSchema);
