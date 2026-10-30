import axios, {AxiosInstance, AxiosRequestConfig} from 'axios';
import {throwFromAxiosError} from '../errors';
import {getInternalToken, INTERNAL_TOKEN_HEADER} from '../libs/internal-token';
import {Logger} from '../logger';

export type MicroServiceQuery = {[key: string]: any};

export interface InternalMicroServiceMethods {
  find<T = any>(query: MicroServiceQuery, config?: IConfig<T>): Promise<T[]>;
  get<T = any>(
    id: string | null,
    query?: MicroServiceQuery,
    config?: IConfig<T>
  ): Promise<T | null>;
  create<T = any, U = any>(
    data: Partial<U>,
    query?: MicroServiceQuery,
    config?: IConfig<T>
  ): Promise<T | null>;
  update<T = any, U = any>(
    id: string,
    data: U,
    query?: MicroServiceQuery,
    config?: IConfig<T>
  ): Promise<T | null>;
  patch<T = any, U = any>(
    id: string,
    data: Partial<U>,
    query?: MicroServiceQuery,
    config?: IConfig<T>
  ): Promise<T | null>;
  remove<T = any>(
    id: string,
    query?: MicroServiceQuery,
    config?: IConfig<T>
  ): Promise<T | T[] | null>;
  readonly request: AxiosInstance;
  readonly call: AxiosInstance;
  readonly name: string;
  readonly baseURL: string;
  readonly service: string;
  readonly url: string;
}

export interface InternalMicroServiceOptions {
  axiosConfig?: AxiosRequestConfig;
  name: string;
  baseURL: string;
  service: string;
}

interface IConfig<T = any> {
  axiosConfig?: AxiosRequestConfig;
  execption?: {
    handle?: boolean;
    defaultValue?: Partial<T> | null;
  };
}

export class MicroService implements InternalMicroServiceMethods {
  readonly request: AxiosInstance;
  readonly name: string;
  readonly baseURL: string;
  readonly service: string;
  readonly url: string;

  constructor({
    axiosConfig,
    name,
    service,
    baseURL,
  }: InternalMicroServiceOptions) {
    const providedAxiosConfig = axiosConfig ?? {};
    const internalToken = getInternalToken();
    this.request = axios.create({
      baseURL,
      ...providedAxiosConfig,
      headers: {
        ...(internalToken ? {[INTERNAL_TOKEN_HEADER]: internalToken} : {}),
        ...providedAxiosConfig.headers,
      },
    });
    this.name = name;
    this.baseURL = baseURL;
    this.service = service;
    this.url = `/${service}`;
  }

  throwError(err: any): never {
    return throwFromAxiosError(err);
  }

  async find<T = any>(
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T[]> {
    const defaultValue: T[] = [];
    const {axiosConfig = {}, execption = {}} = this.getConfig(
      config,
      defaultValue
    );
    try {
      const {data} = await this.request.get(`${this.url}`, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  async get<T = any>(
    id: string | null,
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T | null> {
    const defaultValue = {};
    const {axiosConfig = {}, execption = {}} = this.getConfig(
      config,
      defaultValue
    );
    try {
      const {data} = await this.request.get(`${this.url}/${id}`, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  async create<T = any, U = any>(
    payload: Partial<U>,
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T> {
    const defaultValue = {};
    const {axiosConfig = {}, execption = {}} = this.getConfig(config, {});
    try {
      const {data} = await this.request.post(`${this.url}`, payload, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  async update<T = any, U = any>(
    id: string,
    payload: U,
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T | null> {
    const defaultValue = {};
    const {axiosConfig = {}, execption = {}} = this.getConfig(config, {});
    try {
      const {data} = await this.request.put(`${this.url}/${id}`, payload, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  async patch<T = any, U = any>(
    id: string,
    payload: Partial<U>,
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T | null> {
    const defaultValue = {};
    const {axiosConfig = {}, execption = {}} = this.getConfig(config, {});
    try {
      const {data} = await this.request.patch(`${this.url}/${id}`, payload, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  async remove<T = any>(
    id: string,
    query?: MicroServiceQuery,
    config: IConfig<T> = {}
  ): Promise<T | T[] | null> {
    const defaultValue = {};
    const {axiosConfig = {}, execption = {}} = this.getConfig(config, {});
    try {
      const {data} = await this.request.delete(`${this.url}/${id}`, {
        ...axiosConfig,
        params: query,
      });
      return data?.data ?? data;
    } catch (err) {
      return this.handleException(execption, defaultValue, err);
    }
  }

  get call() {
    return this.request;
  }

  private getLog(error: any) {
    const message = error?.response?.data?.message;
    const status = error?.response?.status;
    Logger.error(`Error ${this.name}`, {
      message,
      status,
      url: this.url,
      error,
      errorMessage: message ?? error?.message ?? error,
    });
  }

  private getConfig(config: IConfig<any>, defaultValue: any) {
    const {axiosConfig = {}, execption = {}} = config ?? {
      axiosConfig: {},
      execption: {
        defaultValue,
        handle: false,
      },
    };
    return {
      axiosConfig,
      execption,
    };
  }
  private handleException(
    execption: IConfig['execption'],
    defaultInitialValue: any,
    err: any
  ) {
    const {defaultValue = defaultInitialValue, handle = false} = execption ?? {
      defaultValue: defaultInitialValue,
      handle: false,
    };
    if (handle) {
      this.getLog(err);
      return defaultValue;
    }
    return this.throwError(err);
  }
}

export interface IMicroService {
  name: string;
  baseURL: string;
  config?: AxiosRequestConfig;
  services: string[];
}
