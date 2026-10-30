import {integer, pgTable, serial, text} from 'drizzle-orm/pg-core';

export default pgTable('orders', {
  id: serial('id').primaryKey(),
  total: integer('total').notNull(),
  status: text('status').default('open'),
});
