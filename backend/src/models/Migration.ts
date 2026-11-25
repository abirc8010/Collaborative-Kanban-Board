import { Schema, model } from 'mongoose';

const migrationSchema = new Schema({
  _id: { type: String, required: true },
  completedAt: { type: Date, required: true },
  boardId: { type: Schema.Types.ObjectId, ref: 'Board' },
}, { versionKey: false, collection: 'system_migrations' });

export const MigrationModel = model('BoardMigration', migrationSchema);
