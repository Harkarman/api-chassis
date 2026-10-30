import type {Request, Response} from 'express';
import type {ModelStatic, FindOptions, DestroyOptions} from 'sequelize';

import {FindResponse, InternalServiceMethods, Query, User} from './types';

export interface PostgresInternalServiceMethods<
  T = any,
> extends InternalServiceMethods<any> {
  model: ModelStatic<any>;
}

export interface PostgresInternalServiceOptions<T = any> {
  Model: ModelStatic<any>;
  pagination?: boolean;
}

export class PostgreSQLService<
  T = any,
> implements PostgresInternalServiceMethods<T> {
  protected readonly Model: ModelStatic<any>;
  pagination?: boolean | undefined;
  constructor({Model, pagination}: PostgresInternalServiceOptions<T>) {
    this.Model = Model;
    this.pagination = pagination;
  }
  async find(
    query?: any,
    user?: User,
    req?: Request
  ): Promise<FindResponse<T>> {
    const {$limit, $offset, ...restQuery} = query ?? {};
    const modelQuery: FindOptions<any> = {
      where: {
        ...(restQuery ?? {}),
      },
    };
    if ($limit) {
      modelQuery.limit = $limit;
    }
    if ($offset) {
      modelQuery.offset = $offset;
    }
    if (this.pagination) {
      return await this.Model.findAndCountAll(modelQuery);
    }
    return await this.Model.findAll(modelQuery);
  }

  async get(
    id: string | null,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null> {
    if (id) {
      return await this.Model.findByPk(id);
    }
    return await this.Model.findOne({
      where: {
        ...(query ?? {}),
      },
    });
  }

  async create(
    data: Partial<T> | Partial<T>[],
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<any> {
    return await this.Model.create(data as any);
  }

  async update(
    id: string,
    data: any,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<any> {
    return await this.Model.update(
      {...data},
      {
        where: {
          id,
          ...(query ?? {}),
        },
      }
    );
  }

  async patch(
    id: string,
    data: Partial<T>,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<any> {
    return await this.Model.update(
      {...data},
      {
        where: {
          id,
          ...(query ?? {}),
        },
      }
    );
  }

  async remove(
    id: string,
    query?: DestroyOptions,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<any> {
    return await this.Model.destroy({
      where: {
        id,
        ...(query ?? {}),
      },
    });
  }

  get model() {
    return this.Model;
  }

  async _find(
    query?: Query,
    user?: User,
    req?: Request
  ): Promise<FindResponse<T>> {
    const {$limit, $offset, ...restQuery} = query ?? {};
    const modelQuery: FindOptions<any> = {
      where: {
        ...(restQuery ?? {}),
      },
    };
    if ($limit) {
      modelQuery.limit = $limit;
    }
    if ($offset) {
      modelQuery.offset = $offset;
    }
    if (this.pagination) {
      return await this.Model.findAndCountAll(modelQuery);
    }
    return await this.Model.findAll(modelQuery);
  }

  async _get(id: string | null, query?: Query): Promise<T | null> {
    if (id) {
      return await this.Model.findByPk(id);
    }
    return await this.Model.findOne({
      where: {
        ...(query ?? {}),
      },
    });
  }

  async _create(data: Partial<T> | Partial<T>[]): Promise<T | T[]> {
    return await this.Model.create(data as any);
  }

  async _update(id: string, data: Partial<any>): Promise<any> {
    const [, updatedData] = await this.Model.update(
      {...data},
      {
        where: {
          id,
        },
        returning: true,
      }
    );
    return updatedData;
  }

  async _patch(id: string, data: Partial<T>): Promise<any> {
    const [, updatedData] = await this.Model.update(
      {...data},
      {
        where: {
          id,
        },
        returning: true,
      }
    );
    return updatedData;
  }

  async _remove(id: string, query?: Query): Promise<any> {
    return await this.Model.destroy({
      where: {
        id,
        ...(query ?? {}),
      },
    });
  }
}
