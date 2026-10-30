import type {Request, Response} from 'express';
import type {Column, SQL, Table} from 'drizzle-orm';
import {BadRequest} from '../../errors';
import type {FindResponse, InternalServiceMethods, Query, User} from './types';

// Only Drizzle's core query builders and operators are used here, which are
// the same in drizzle-orm 0.45 and 1.x. The relational query API
// (`db.query`), `relations()` and `db.execute()` are deliberately avoided.

type DrizzleOrm = typeof import('drizzle-orm');

declare const require: NodeJS.Require | undefined;

let drizzleOrm: Promise<DrizzleOrm> | undefined;

/**
 * Loaded on first use, so apps without a database don't need drizzle-orm. The CJS
 * build requires it, so a CommonJS app shares its own copy of Drizzle rather
 * than loading the ESM build alongside it. In the ESM build `require` is a
 * bundler shim that throws, so that falls through to import().
 */
function loadDrizzle(): Promise<DrizzleOrm> {
  drizzleOrm ??= (async () => {
    try {
      if (typeof require === 'function') {
        try {
          return require('drizzle-orm') as DrizzleOrm;
        } catch (error: any) {
          if (error?.code === 'MODULE_NOT_FOUND') {
            throw error;
          }
        }
      }
      return await import('drizzle-orm');
    } catch (error: any) {
      if (
        error?.code === 'MODULE_NOT_FOUND' ||
        error?.code === 'ERR_MODULE_NOT_FOUND'
      ) {
        throw new Error(
          'Database services need drizzle-orm: npm install drizzle-orm',
          {cause: error}
        );
      }
      throw error;
    }
  })();
  return drizzleOrm;
}

/**
 * The parts of a Drizzle Postgres database (`drizzle(...)` from any driver)
 * that the adapter uses.
 */
export interface DrizzleDatabase {
  select(...args: any[]): any;
  insert(table: any): any;
  update(table: any): any;
  delete(table: any): any;
}

export interface PostgresInternalServiceOptions {
  /** The service's Drizzle table, e.g. the result of `pgTable(...)`. */
  Model: Table;
  db: DrizzleDatabase;
  /** When true, `find` returns `{rows, count}` instead of an array. */
  pagination?: boolean;
  /** Column (by its JS key) used for `:id`. Defaults to the table's primary key. */
  primaryKey?: string;
}

/** A query string translated for Drizzle's query builder. */
export interface DrizzleQuery {
  where?: SQL;
  limit?: number;
  offset?: number;
}

const OPERATORS = {
  $gt: 'gt',
  $gte: 'gte',
  $lt: 'lt',
  $lte: 'lte',
  $ne: 'ne',
  $in: 'inArray',
  $nin: 'notInArray',
  $like: 'like',
  $ilike: 'ilike',
} as const;

type Operator = keyof typeof OPERATORS;

function toCount(name: string, value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const count = typeof value === 'number' ? value : Number(value);
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    (typeof value === 'string' && !/^\d+$/.test(value))
  ) {
    new BadRequest(`${name} must be a non-negative integer`);
  }
  return count;
}

/**
 * Translates an api-chassis query (`?price[$gt]=5&$limit=10`) into a Drizzle
 * `where` condition plus `limit` and `offset`. Keys must be columns of the
 * table; anything else is a 400. Use it in custom service methods so they
 * accept the same query strings as the generic routes.
 */
export async function toDrizzleQuery(
  table: Table,
  query: Query = {}
): Promise<DrizzleQuery> {
  const orm = await loadDrizzle();
  const columns: Record<string, Column> = orm.getTableColumns(table);
  const {$limit, $offset, ...filters} = query;
  const conditions: SQL[] = [];
  // Looked up by name: the operators' overloaded signatures differ slightly
  // between drizzle-orm versions, but the runtime behaviour doesn't.
  const ops = orm as unknown as Record<
    (typeof OPERATORS)[Operator] | 'eq',
    (column: Column, value: unknown) => SQL
  >;

  for (const [key, value] of Object.entries(filters)) {
    const column = Object.hasOwn(columns, key) ? columns[key] : undefined;
    if (!column) {
      new BadRequest(`Unknown query field "${key}"`);
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [operator, operand] of Object.entries(value)) {
        if (!Object.hasOwn(OPERATORS, operator)) {
          new BadRequest(`Unsupported operator "${operator}" on "${key}"`);
        }
        const name = OPERATORS[operator as Operator];
        if (name === 'inArray' || name === 'notInArray') {
          const list = Array.isArray(operand) ? operand : [operand];
          conditions.push(ops[name](column!, list));
        } else {
          conditions.push(ops[name](column!, operand));
        }
      }
    } else if (Array.isArray(value)) {
      // ?id=1&id=2
      conditions.push(ops.inArray(column!, value));
    } else {
      conditions.push(ops.eq(column!, value));
    }
  }

  return {
    where: conditions.length ? orm.and(...conditions) : undefined,
    limit: toCount('$limit', $limit),
    offset: toCount('$offset', $offset),
  };
}

export class PostgreSQLService<T = any> implements InternalServiceMethods<T> {
  readonly Model: Table;
  readonly db: DrizzleDatabase;
  pagination?: boolean;
  private readonly primaryKeyName?: string;
  private columns?: Record<string, Column>;

  constructor({
    Model,
    db,
    pagination,
    primaryKey,
  }: PostgresInternalServiceOptions) {
    if (!db) {
      throw new Error(
        'Database services need a Drizzle database: pass it as `database.instance`'
      );
    }
    this.Model = Model;
    this.db = db;
    this.pagination = pagination;
    this.primaryKeyName = primaryKey;
  }

  get model() {
    return this.Model;
  }

  private async tableColumns() {
    this.columns ??= (await loadDrizzle()).getTableColumns(this.Model);
    return this.columns;
  }

  private async primaryKey(): Promise<Column> {
    const columns = await this.tableColumns();
    if (this.primaryKeyName) {
      const column = columns[this.primaryKeyName];
      if (!column) {
        throw new Error(`primaryKey "${this.primaryKeyName}" is not a column`);
      }
      return column;
    }
    const primary = Object.values(columns).filter(column => column.primary);
    if (primary.length !== 1) {
      throw new Error(
        'The table needs a single-column primary key, or set `primaryKey` on the service'
      );
    }
    return primary[0];
  }

  /** The id condition, combined with any filters from the query. */
  private async byId(id: string | null, query?: Query) {
    const orm = await loadDrizzle();
    const {where} = await toDrizzleQuery(this.Model, query);
    if (id === null || id === undefined) {
      return where;
    }
    return orm.and(orm.eq(await this.primaryKey(), id), where);
  }

  /** Keeps only keys that are columns, so a body can't set arbitrary fields. */
  private async values(data: any) {
    const columns = await this.tableColumns();
    const values = Object.fromEntries(
      Object.entries(data ?? {}).filter(
        ([key, value]) => Object.hasOwn(columns, key) && value !== undefined
      )
    );
    if (!Object.keys(values).length) {
      new BadRequest('No valid fields in the request body');
    }
    return values;
  }

  async find(
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<FindResponse<T>> {
    return this._find(query);
  }

  async get(
    id: string | null,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return this._get(id, query);
  }

  async create(
    data: Partial<T> | Partial<T>[],
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[]> {
    return this._create(data);
  }

  async update(
    id: string,
    data: T,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return this.updateWhere(id, data, query);
  }

  async patch(
    id: string,
    data: Partial<T>,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return this.updateWhere(id, data, query);
  }

  async remove(
    id: string,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return this._remove(id, query);
  }

  async _find(query?: Query): Promise<FindResponse<T>> {
    const orm = await loadDrizzle();
    const {where, limit, offset} = await toDrizzleQuery(this.Model, query);
    let select = this.db
      .select()
      .from(this.Model)
      .where(where)
      .orderBy(await this.primaryKey());
    if (limit !== undefined) {
      select = select.limit(limit);
    }
    if (offset !== undefined) {
      select = select.offset(offset);
    }
    const rows: T[] = await select;
    if (!this.pagination) {
      return rows;
    }
    const [{count}] = await this.db
      .select({count: orm.sql`count(*)`.mapWith(Number)})
      .from(this.Model)
      .where(where);
    return {rows, count};
  }

  async _get(id: string | null, query?: Query): Promise<T | null> {
    const [row] = await this.db
      .select()
      .from(this.Model)
      .where(await this.byId(id, query))
      .limit(1);
    return row ?? null;
  }

  async _create(data: Partial<T> | Partial<T>[]): Promise<T | T[]> {
    if (Array.isArray(data)) {
      if (!data.length) {
        new BadRequest('No records to create');
      }
      const values = await Promise.all(data.map(item => this.values(item)));
      return await this.db.insert(this.Model).values(values).returning();
    }
    const [row] = await this.db
      .insert(this.Model)
      .values(await this.values(data))
      .returning();
    return row;
  }

  async _update(id: string, data: T): Promise<T | null> {
    return this.updateWhere(id, data);
  }

  async _patch(id: string, data: Partial<T>): Promise<T | null> {
    return this.updateWhere(id, data);
  }

  async _remove(id: string, query?: Query): Promise<T | null> {
    const [row] = await this.db
      .delete(this.Model)
      .where(await this.byId(id, query))
      .returning();
    return row ?? null;
  }

  private async updateWhere(
    id: string,
    data: Partial<T>,
    query?: Query
  ): Promise<T | null> {
    const [row] = await this.db
      .update(this.Model)
      .set(await this.values(data))
      .where(await this.byId(id, query))
      .returning();
    return row ?? null;
  }
}
