import axios, {AxiosInstance, AxiosRequestConfig} from 'axios';
import {throwFromAxiosError} from '../errors';

export type AuthServiceQuery = {[key: string]: any};

export interface InternalAuthServiceMethods {
  readonly request: AxiosInstance;
  readonly baseURL: string;
}

export interface InternalAuthServiceOptions {
  axiosConfig?: AxiosRequestConfig;
  baseURL: string;
}

export class AuthService implements InternalAuthServiceMethods {
  readonly request: AxiosInstance;
  readonly baseURL: string;

  constructor({axiosConfig, baseURL}: InternalAuthServiceOptions) {
    this.request = axios.create({...(axiosConfig ?? {}), baseURL});
    this.baseURL = baseURL;
  }

  throwError(err: any): never {
    return throwFromAxiosError(err);
  }

  async verify<T = any>(
    query?: AuthServiceQuery,
    config: AxiosRequestConfig = {}
  ): Promise<T[]> {
    try {
      // No request body: the token travels in the Authorization header.
      const {data} = await this.request.post(
        `${this.baseURL}/verify`,
        undefined,
        {...config, params: query}
      );
      return data?.data ?? data;
    } catch (err: any) {
      return this.throwError(err);
    }
  }
}
