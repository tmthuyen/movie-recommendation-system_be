import { format, transports } from 'winston';
import { WinstonModuleOptions } from 'nest-winston';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const serviceName = process.env.SERVICE_NAME || 'movie-backend';
const logFormat = process.env.LOG_FORMAT || (isProduction ? 'json' : 'text');
const useJsonFormat = logFormat === 'json';

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json(),
);

export const loggerConfig: WinstonModuleOptions = {
  // chỉ là OPTIONS, không phải logger instance
  level: logLevel,
  defaultMeta: { service: serviceName },
  transports: [
    new transports.Console({
      format: useJsonFormat
        ? jsonFormat
        : format.combine(
            format.colorize(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.errors({ stack: true }),
            format.printf(({ timestamp, level, message, context }) => {
              return `[Nest] ${String(timestamp)}  ${level}: [${String(context) || 'App'}] ${String(message)}`;
            }),
          ),
    }),
  ],
};
