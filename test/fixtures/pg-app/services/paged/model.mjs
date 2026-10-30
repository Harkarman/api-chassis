import {integer, pgTable, serial} from 'drizzle-orm/pg-core';

export default pgTable('paged', {
  id: serial('id').primaryKey(),
  total: integer('total').notNull(),
});
