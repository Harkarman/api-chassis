// Creates the fixture tables in a fresh in-memory Postgres (PGlite).
export async function createDatabase() {
  const {PGlite} = await import('@electric-sql/pglite');
  const {drizzle} = await import('drizzle-orm/pglite');
  const client = new PGlite();
  await client.exec(`
    create table orders (id serial primary key, total integer not null, status text default 'open');
    create table paged (id serial primary key, total integer not null);
  `);
  return drizzle({client});
}
