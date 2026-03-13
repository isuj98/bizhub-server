import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    status: { type: String, default: 'todo' },
    priority: { type: String, default: 'medium' },
    dueDate: { type: String },
  },
  { _id: false }
);

const businessSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    hubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hub' },
    tasks: { type: [taskSchema], default: [] },
    website_url: { type: String, trim: true },
    api_endpoint: { type: String, trim: true },
    business_type: { type: String, trim: true },
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

businessSchema.index({ userId: 1 });

export const Business = mongoose.model('Business', businessSchema);
