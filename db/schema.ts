import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Each curator owns an evidence notebook. Geometry refers to original image coordinates.
export const photoResearch = sqliteTable('photo_research', {
  ownerId: text('owner_id').notNull(),
  id: text('id').notNull(),
  body: text('body').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.id] })]);
