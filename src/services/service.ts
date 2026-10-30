import {Request, Response} from 'express';
import type {Model as MongoModel} from 'mongoose';
import type {ModelStatic as SequelizeModel} from 'sequelize';
import type {Dialect} from '..';
import {
  FindResponse,
  InternalServiceMethods,
  MongoDBService,
  PostgreSQLService,
  Query,
  User,
} from './databases';

export type {InternalServiceMethods, Query, User} from './databases';

type ServiceType<T, U extends Dialect> = U extends 'postgres'
  ? PostgreSQLService<T>
  : MongoDBService<T>;

type ModelType<T, U extends Dialect> = U extends 'postgres'
  ? SequelizeModel<any>
  : MongoModel<T>;

/** Postgres services with `pagination` return `{rows, count}`; Mongo returns an array. */
export type FindResult<T, U extends Dialect> = U extends 'postgres'
  ? FindResponse<T>
  : T[];

export interface IChassisServiceProps {
  Model: any;
  dialect?: Dialect;
  pagination?: boolean;
}

/** @deprecated Use IChassisServiceProps */
export type InternalServiceOptions = IChassisServiceProps;

export class ChassisService<
  T,
  U extends Dialect = 'mongodb',
> implements InternalServiceMethods<T> {
  protected readonly Model: ModelType<T, U>;
  private readonly dialect?: Dialect;
  private adapter?: ServiceType<T, U>;
  pagination?: boolean;

  constructor({Model, dialect, pagination}: IChassisServiceProps) {
    this.Model = Model;
    this.dialect = dialect;
    this.pagination = pagination;
  }

  // Built on first use rather than in the constructor, so subclass field
  // initialisers (e.g. `pagination = true`) have already run.
  private get service(): ServiceType<T, U> {
    if (!this.adapter) {
      this.adapter = (
        this.dialect === 'postgres'
          ? new PostgreSQLService<T>({
              Model: this.Model as SequelizeModel<any>,
              pagination: this.pagination,
            })
          : new MongoDBService<T>({Model: this.Model as MongoModel<any>})
      ) as ServiceType<T, U>;
    }
    return this.adapter;
  }

  async find(
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<FindResult<T, U>> {
    return (await this.service.find(query, user, req, res)) as FindResult<T, U>;
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
  ): Promise<T | T[] | null> {
    return await this.service.patch(id, data, query, user, req, res);
  }

  async remove(
    id: string,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null> {
    return await this.service.remove(id, query, user, req, res);
  }

  get model(): ModelType<T, U> {
    return this.Model;
  }

  async _find(query?: Query): Promise<FindResult<T, U>> {
    return (await this.service._find(query)) as FindResult<T, U>;
  }

  async _get(id: string | null, query?: Query): Promise<T | null> {
    return await this.service._get(id, query);
  }

  async _create(data: Partial<T> | Partial<T>[]): Promise<T | T[]> {
    return await this.service._create(data);
  }

  async _update(id: string, data: T): Promise<T | null> {
    return await this.service._update(id, data as T & Partial<any>);
  }

  async _patch(id: string, data: Partial<T>): Promise<T | T[] | null> {
    return await this.service._patch(id, data);
  }

  async _remove(id: string, query?: Query): Promise<T | T[] | null> {
    return await this.service._remove(id, query);
  }
}
