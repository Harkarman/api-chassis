import winston from 'winston';

export type Level =
  'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export class Logger {
  static isLocalEnv = process.env.NODE_ENV === 'local';
  static readonly instance = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
      winston.format.json(),
      winston.format.errors({stack: true}), // <-- use errors format
      winston.format.timestamp()
    ),
    exitOnError: false,
  });

  static info(message: string, payload: any = {}) {
    if (Logger.isLocalEnv) {
      console.info(message, payload);
      return;
    }
    Logger.instance.info(message, payload);
  }
  static error(message: string, error: any) {
    if (Logger.isLocalEnv) {
      console.error(message, error);
      return;
    }
    Logger.instance.error(message, error);
  }
  static warn(message: string, data: any) {
    if (Logger.isLocalEnv) {
      console.warn(message, data);
      return;
    }
    Logger.instance.warn(message, data);
  }
  static debug(message: string, data: any) {
    if (Logger.isLocalEnv) {
      console.debug(message, data);
      return;
    }
    Logger.instance.debug(message, data);
  }

  static enableLogger() {
    Logger.isLocalEnv = true;
  }
}
