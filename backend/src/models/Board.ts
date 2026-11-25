import { Schema, model } from 'mongoose';

const memberSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['viewer', 'editor'], required: true },
  createdAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const linkAccessSchema = new Schema({
  enabled: { type: Boolean, required: true, default: false },
  role: { type: String, enum: ['viewer', 'editor'], required: true, default: 'viewer' },
}, { _id: false });

const boardSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  visibility: { type: String, enum: ['public', 'private'], required: true, default: 'private' },
  linkAccess: { type: linkAccessSchema, default: undefined },
  members: { type: [memberSchema], default: [] },
}, { timestamps: true, versionKey: false });

boardSchema.pre('validate', function () {
  if (this.linkAccess && !this.linkAccess.enabled && this.linkAccess.role !== 'viewer') {
    this.invalidate('linkAccess.role', 'Restricted boards cannot have an editor link permission.');
  }
});

boardSchema.index({ ownerId: 1, updatedAt: -1 });
boardSchema.index({ 'members.userId': 1, updatedAt: -1 });
export const BoardModel = model('Board', boardSchema);
export type BoardRole = 'owner' | 'editor' | 'viewer' | 'public' | 'link-editor';
export type Visibility = 'public' | 'private';
export interface LinkAccess { enabled: boolean; role: 'viewer' | 'editor'; }
export interface BoardRecord {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  visibility: Visibility;
  linkAccess: LinkAccess;
  role: BoardRole;
  members: Array<{ userId: string; username: string; role: 'viewer' | 'editor'; createdAt: string }>;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}
