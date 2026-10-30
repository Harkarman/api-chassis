import {boolean, integer, pgTable, serial, text} from 'drizzle-orm/pg-core';

export default pgTable('widgets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price'),
  validated: boolean('validated'),
});
