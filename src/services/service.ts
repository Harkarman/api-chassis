import {Request, Response} from 'express';
import type {Table} from 'drizzle-orm';
import {
  DrizzleDatabase,
  DrizzleQuery,
  FindResponse,
  InternalServiceMethods,
  PostgreSQLService,
  Query,
  toDrizzleQuery,
  User,
} from './databases';

export type {InternalServiceMethods, Query, User} from './databases';

/** An array, or `{rows, count}` when the service has `pagination` on. */
export type FindResult<T> = FindResponse<T>;

export interface IChassisServiceProps {
  /** The service's Drizzle table (the `model` file's default export). */
  Model: any;
  pagination?: boolean;
  /** The Drizzle database (`database.instance`). */
  db?: DrizzleDatabase;
}

/** @deprecated Use IChassisServiceProps */
export type InternalServiceOptions = IChassisServiceProps;

export class ChassisService<T> implements InternalServiceMethods<T> {
  protected readonly Model: Table;
  /** The Drizzle database, for custom queries. */
  protected readonly db?: DrizzleDatabase;
  private adapter?: PostgreSQLService<T>;
  pagination?: boolean;
  /** The column (by JS key) used for `:id`. Defaults to the primary key. */
  primaryKey?: string;

  constructor({Model, pagination, db}: IChassisServiceProps) {
    this.Model = Model;
    this.pagination = pagination;
    this.db = db;
  }

  /**
   * Turns a query (`?price[$gt]=5&$limit=10`) into a Drizzle `where`, `limit`
   * and `offset`, for custom queries that should accept the same query
   * strings as the generic routes.
   */
  protected toDrizzleQuery(query?: Query): Promise<DrizzleQuery> {
    return toDrizzleQuery(this.Model, query);
  }

  // Built on first use rather than in the constructor, so subclass field
  // initialisers (e.g. `pagination = true`) have already run.
  private get service(): PostgreSQLService<T> {
    this.adapter ??= new PostgreSQLService<T>({
      Model: this.Model,
      db: this.db!,
      pagination: this.pagination,
      primaryKey: this.primaryKey,
    });
    return this.adapter;
  }

  async find(
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<FindResult<T>> {
    return await this.service.find(query, user, req, res);
  }

  async get(
    id: string | null,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.service.get(id, query, user, req, res);
  }

  async create(
    data: Partial<T> | Partial<T>[],
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[]> {
    return await this.service.create(data, query, user, req, res);
  }

  async update(
    id: string,
    data: T,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.service.update(id, data, query, user, req, res);
  }

  async patch(
    id: string,
    data: Partial<T>,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.service.patch(id, data, query, user, req, res);
  }

  async remove(
    id: string,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.service.remove(id, query, user, req, res);
  }

  get model(): Table {
    return this.Model;
  }

  async _find(query?: Query): Promise<FindResult<T>> {
    return await this.service._find(query);
  }

  async _get(id: string | null, query?: Query): Promise<T | null> {
    return await this.service._get(id, query);
  }

  async _create(data: Partial<T> | Partial<T>[]): Promise<T | T[]> {
    return await this.service._create(data);
  }

  async _update(id: string, data: T): Promise<T | null> {
    return await this.service._update(id, data);
  }

  async _patch(id: string, data: Partial<T>): Promise<T | null> {
    return await this.service._patch(id, data);
  }

  async _remove(id: string, query?: Query): Promise<T | null> {
    return await this.service._remove(id, query);
  }
}
