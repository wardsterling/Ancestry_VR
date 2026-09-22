import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Each curator owns an evidence notebook. Geometry refers to original image coordinates.
export const photoResearch = sqliteTable('photo_research', {
  ownerId: text('owner_id').notNull(),
  id: text('id').notNull(),
  body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.id] })]);

export const archiveItems = sqliteTable('archive_items', {
  ownerId: text('owner_id').notNull(),
  id: text('id').notNull(),
  body: text('body').notNull(),
  objectKey: text('object_key'),
  contentHash: text('content_hash'),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.id] })]);

// A complete, validated archive becomes visible with one revision change.
export const archiveState = sqliteTable('archive_state', {
  ownerId: text('owner_id').primaryKey(),
  body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});
