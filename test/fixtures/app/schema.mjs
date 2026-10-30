// Creates the fixture tables in a fresh in-memory Postgres (PGlite).
export async function createDatabase() {
  const {PGlite} = await import('@electric-sql/pglite');
  const {drizzle} = await import('drizzle-orm/pglite');
  const client = new PGlite();
  await client.exec(`
    create table widgets (id serial primary key, name text not null, price integer, validated boolean);
  `);
  return drizzle({client});
}
