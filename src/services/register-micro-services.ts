import {promises} from 'fs';
import path from 'path';
import {Logger} from '../logger';
import {MicroService} from './micro-service';
import {isServiceEntry, loadModule, resolveRootDir} from './load-module';

export async function registerMicroServices(rootDir?: string) {
  const appDir = resolveRootDir(rootDir);
  const serviceDirPath = path.join(appDir, 'micro-services');

  const services: any = {};

  let entries: string[];
  try {
    entries = await promises.readdir(serviceDirPath);
  } catch {
    // micro-services/ is optional
    return services;
  }
  const servicesNames = entries.filter(
    file => isServiceEntry(file) && !/types\./.test(file)
  );

  for (const serviceName of servicesNames) {
    const servicePath = `${serviceDirPath}/${serviceName}`;
    try {
      const service = new (await loadModule(servicePath)).default();
      if (service) {
        const {baseURL, name, services: subServicesNames, config} = service;
        services[name] = services[name] ?? {};
        subServicesNames?.forEach((service: string) => {
          services[name][service] = new MicroService({
            axiosConfig: config,
            name,
            service,
            baseURL,
          });
        });
        services[serviceName] = service;
      }
    } catch (error) {
      Logger.error(`Failed to load micro-service ${serviceName}`, {error});
      throw error;
    }
  }
  return services;
}
