export * from './services';
export * from './errors';
export * from './hooks';
export * from './libs';
export * from './logger';
export * from './app';

export interface ServiceTypes {
  [service: string]: any;
}
export interface MicroServiceNames {
  [microService: string]: {
    [service: string]: any;
  };
}
export interface SubMicroServiceNames {
  [service: string]: any;
}
