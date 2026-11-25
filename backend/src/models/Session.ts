import { Schema, model } from 'mongoose';

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  csrfToken: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, versionKey: false });

sessionSchema.index({ userId: 1, expiresAt: 1 });
export const SessionModel = model('Session', sessionSchema);
export interface SessionRecord { id: string; userId: string; tokenHash: string; csrfToken: string; expiresAt: Date; }
