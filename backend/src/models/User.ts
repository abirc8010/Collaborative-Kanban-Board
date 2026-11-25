import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
  normalizedUsername: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true, versionKey: false });

export const UserModel = model('User', userSchema);
export interface UserRecord { id: string; username: string; createdAt: string; updatedAt: string; }
export function toUserRecord(user: { _id: unknown; username: string; createdAt: Date; updatedAt: Date }): UserRecord {
  return { id: String(user._id), username: user.username, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
}
