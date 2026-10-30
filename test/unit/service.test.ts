import {PGlite} from '@electric-sql/pglite';
import {sql} from 'drizzle-orm';
import {drizzle as drizzlePglite} from 'drizzle-orm/pglite';
import {drizzle as drizzlePg} from 'drizzle-orm/node-postgres';
import {integer, pgTable, serial, text} from 'drizzle-orm/pg-core';
import {Pool} from 'pg';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {ChassisService, toDrizzleQuery} from '../../src/services';

const widgets = pgTable('chassis_test_widgets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price'),
  ownerId: integer('owner_id'),
});

const slugged = pgTable('chassis_test_slugged', {
  slug: text('slug').notNull(),
  title: text('title'),
});

interface Widget {
  id: number;
  name: string;
  price: number | null;
  ownerId: number | null;
}

// PGlite always; a real Postgres server too when DATABASE_URL is set.
const drivers: [
  string,
  () => Promise<{db: any; close: () => Promise<void>}>,
][] = [
  [
    'pglite',
    async () => {
      const client = new PGlite();
      return {db: drizzlePglite({client}), close: () => client.close()};
    },
  ],
];
if (process.env.DATABASE_URL) {
  drivers.push([
    'node-postgres',
    async () => {
      const pool = new Pool({connectionString: process.env.DATABASE_URL});
      return {db: drizzlePg({client: pool}), close: () => pool.end()};
    },
  ]);
}

const thrown = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as any;
  }
  throw new Error('expected a rejection');
};

describe.each(drivers)('postgres adapter (%s)', (_name, connect) => {
  let db: any;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({db, close} = await connect());
  });
  afterAll(() => close?.());

  beforeEach(async () => {
    for (const statement of [
      sql`drop table if exists chassis_test_widgets`,
      sql`drop table if exists chassis_test_slugged`,
      sql`create table chassis_test_widgets (id serial primary key, name text not null, price integer, owner_id integer)`,
      sql`create table chassis_test_slugged (slug text not null, title text)`,
    ]) {
      // The adapter avoids db.execute; tests use it only for DDL.
      await db.execute(statement);
    }
  });

  const service = (options: {pagination?: boolean} = {}) =>
    new ChassisService<Widget>({
      Model: widgets,
      db,
      ...options,
    });

  const seed = async () => {
    const s = service();
    return (await s.create([
      {name: 'a', price: 10, ownerId: 1},
      {name: 'b', price: 20, ownerId: 1},
      {name: 'c', price: 30, ownerId: 2},
    ])) as Widget[];
  };

  it('creates one row or many', async () => {
    const s = service();
    expect(await s.create({name: 'x', price: 1})).toMatchObject({
      id: 1,
      name: 'x',
    });
    const many = await s.create([{name: 'y'}, {name: 'z'}]);
    expect((many as Widget[]).map(w => w.name)).toEqual(['y', 'z']);
  });

  it('ignores body keys that are not columns', async () => {
    const created = await service().create({name: 'x', isAdmin: true} as any);
    expect(created).not.toHaveProperty('isAdmin');
  });

  it('rejects bodies with no column keys', async () => {
    expect(await thrown(service().create({nope: 1} as any))).toMatchObject({
      status: 400,
    });
  });

  it('finds with equality, operators, $in and limit/offset', async () => {
    await seed();
    const s = service();
    const names = async (query: object) =>
      ((await s.find(query as any)) as Widget[]).map(w => w.name);

    expect(await names({})).toEqual(['a', 'b', 'c']);
    expect(await names({ownerId: '1'})).toEqual(['a', 'b']);
    expect(await names({price: {$gt: '15'}})).toEqual(['b', 'c']);
    expect(await names({price: {$gte: '20', $lt: '30'}})).toEqual(['b']);
    expect(await names({name: {$ne: 'a'}})).toEqual(['b', 'c']);
    expect(await names({id: {$in: ['1', '3']}})).toEqual(['a', 'c']);
    expect(await names({id: ['1', '2']})).toEqual(['a', 'b']);
    expect(await names({id: {$nin: '1'}})).toEqual(['b', 'c']);
    expect(await names({name: {$like: 'b%'}})).toEqual(['b']);
    expect(await names({name: {$ilike: 'C'}})).toEqual(['c']);
    expect(await names({$limit: '2', $offset: '1'})).toEqual(['b', 'c']);
    expect(await names({$offset: '2'})).toEqual(['c']);
  });

  it('rejects unknown fields, operators and bad limits with 400', async () => {
    const s = service();
    for (const query of [
      {nope: '1'},
      {price: {$regex: 'x'}},
      {$limit: '-1'},
      {$limit: '2abc'},
      {$offset: '1.5'},
    ]) {
      expect(await thrown(s.find(query as any))).toMatchObject({status: 400});
    }
  });

  it('paginates with a total count', async () => {
    await seed();
    const result = await service({pagination: true}).find({
      ownerId: '1',
      $limit: '1',
    } as any);
    expect(result).toEqual({
      rows: [expect.objectContaining({name: 'a'})],
      count: 2,
    });
    expect(typeof (result as any).count).toBe('number');
  });

  it('honours `pagination = true` as a class field', async () => {
    class Paged extends ChassisService<Widget> {
      pagination = true;
    }
    await seed();
    const result = await new Paged({
      Model: widgets,
      db,
    }).find();
    expect(result).toMatchObject({count: 3});
  });

  it('gets by id, scoped by the query', async () => {
    const [a] = await seed();
    const s = service();
    expect(await s.get(String(a.id))).toMatchObject({name: 'a'});
    expect(await s.get(String(a.id), {ownerId: '2'})).toBeNull();
    expect(await s.get('999')).toBeNull();
  });

  it('patches and updates, returning the row or null', async () => {
    const [a] = await seed();
    const s = service();
    expect(await s.patch(String(a.id), {price: 99})).toMatchObject({
      name: 'a',
      price: 99,
    });
    expect(
      await s.update(String(a.id), {name: 'renamed'} as Widget)
    ).toMatchObject({name: 'renamed', price: 99});
    expect(await s.patch('999', {price: 1})).toBeNull();
    expect(await s.patch(String(a.id), {price: 5}, {ownerId: '2'})).toBeNull();
  });

  it('removes, returning the deleted row or null', async () => {
    const [a] = await seed();
    const s = service();
    expect(await s.remove(String(a.id), {ownerId: '2'})).toBeNull();
    expect(await s.remove(String(a.id))).toMatchObject({name: 'a'});
    expect(await s.get(String(a.id))).toBeNull();
  });

  it('uses a declared primaryKey on tables without one', async () => {
    class Pages extends ChassisService<any> {
      primaryKey = 'slug';
    }
    const pages = new Pages({Model: slugged, db});
    await pages.create({slug: 'home', title: 'Home'});
    expect(await pages.get('home')).toMatchObject({title: 'Home'});

    const unkeyed = new ChassisService<any>({
      Model: slugged,
      db,
    });
    expect(await thrown(unkeyed.get('home'))).toMatchObject({
      message: expect.stringMatching(/primary key/),
    });
  });

  it('gives custom queries the same query handling and raw SQL', async () => {
    class Report extends ChassisService<Widget> {
      async totals(query: any) {
        const {where} = await this.toDrizzleQuery(query);
        return this.db!.select({
          ownerId: widgets.ownerId,
          total: sql`sum(${widgets.price})`.mapWith(Number),
        })
          .from(widgets)
          .where(where)
          .groupBy(widgets.ownerId)
          .orderBy(widgets.ownerId);
      }
    }
    await seed();
    const report = new Report({Model: widgets, db});
    expect(await report.totals({price: {$gt: '10'}})).toEqual([
      {ownerId: 1, total: 20},
      {ownerId: 2, total: 30},
    ]);
  });

  it('exports toDrizzleQuery for use outside services', async () => {
    const {where, limit, offset} = await toDrizzleQuery(widgets, {
      name: 'a',
      $limit: '5',
    });
    expect(where).toBeDefined();
    expect({limit, offset}).toEqual({limit: 5, offset: undefined});
  });
});

describe('postgres adapter without a database', () => {
  it('fails with a clear message', async () => {
    const s = new ChassisService<Widget>({
      Model: widgets,
    });
    expect(await thrown(s.find())).toMatchObject({
      message: expect.stringMatching(/database\.instance/),
    });
  });
});
