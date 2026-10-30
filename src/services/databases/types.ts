import type {Request, Response} from 'express';

export type Query = {[key: string]: any};

export type User = any;

export type FindResponse<T> =
  | T[]
  | {
      rows: T[];
      count: number;
    };

export interface InternalServiceMethods<T = any> {
  find(
    query: Query,
    user?: any,
    req?: Request,
    res?: Response
  ): Promise<FindResponse<T>>;
  get(
    id: string | null,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null>;
  create(
    data: Partial<T> | Partial<T>[],
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null>;
  update(
    id: string,
    data: T,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | null>;
  patch(
    id: string,
    data: Partial<T>,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null>;
  remove(
    id: string,
    query?: Query,
    user?: User,
    req?: Request,
    res?: Response
  ): Promise<T | T[] | null>;
  _find: InternalServiceMethods<T>['find'];
  _get: InternalServiceMethods<T>['get'];
  _create: InternalServiceMethods<T>['create'];
  _patch: InternalServiceMethods<T>['patch'];
  _update: InternalServiceMethods<T>['update'];
  _remove: InternalServiceMethods<T>['remove'];
  pagination?: boolean;
  filtering?: boolean;
  auth?: string[];
}
