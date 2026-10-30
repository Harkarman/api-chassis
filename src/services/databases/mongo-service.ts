import type {Request, Response} from 'express';
import type {Model} from 'mongoose';
import type {InternalServiceMethods, Query, User} from './types';

export interface MongoInternalServiceMethods<
  T = any,
> extends InternalServiceMethods<T> {
  model: Model<T>;
}

export interface MongoInternalServiceOptions {
  Model: Model<any>;
}

export class MongoDBService<T> implements MongoInternalServiceMethods<T> {
  readonly Model: Model<any>;
  constructor({Model}: MongoInternalServiceOptions) {
    this.Model = Model;
  }
  async find(
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T[]> {
    return await this.Model.find(query ?? {});
  }

  async get(
    id: string | null,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.Model.findOne({
      _id: id,
      ...query,
    });
  }

  async create(
    data: Partial<T> | Partial<T>[],
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[]> {
    return (await this.Model.create(data as any)).toJSON();
  }

  async update(
    id: string,
    data: T,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    return await this.Model.findOneAndUpdate(
      {_id: id},
      {$set: data as Partial<T>},
      {new: true}
    );
  }

  async patch(
    id: string,
    data: Partial<T>,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null> {
    return await this.Model.findOneAndUpdate(
      {_id: id},
      {$set: data as Partial<T>},
      {new: true}
    );
  }

  async remove(
    id: string,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null> {
    return await this.Model.findOneAndDelete({_id: id, ...query});
  }

  get model() {
    return this.Model;
  }

  async _find(query?: Query): Promise<T[]> {
    return await this.Model.find(query ?? {});
  }

  async _get(id: string | null, query?: Query): Promise<T | null> {
    return await this.Model.findOne({
      _id: id,
      ...query,
    });
  }

  async _create(data: Partial<T> | Partial<T>[]): Promise<T | T[]> {
    return (await this.Model.create(data as any)).toJSON();
  }

  async _update(id: string, data: T): Promise<T | null> {
    return await this.Model.findOneAndUpdate(
      {_id: id},
      {$set: data as Partial<T>},
      {new: true}
    );
  }

  async _patch(id: string, data: Partial<T>): Promise<T | T[] | null> {
    return await this.Model.findOneAndUpdate(
      {_id: id},
      {$set: data as Partial<T>},
      {new: true}
    );
  }

  async _remove(id: string, query?: Query): Promise<T | T[] | null> {
    return await this.Model.findOneAndDelete({_id: id, ...query});
  }
}
