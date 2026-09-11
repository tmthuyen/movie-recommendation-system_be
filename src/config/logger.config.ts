import 'winston-daily-rotate-file';
import { format, transports } from 'winston';
import { WinstonModuleOptions } from 'nest-winston';

const isProduction = process.env.NODE_ENV === 'production';

export const loggerConfig: WinstonModuleOptions = {
  // chỉ là OPTIONS, không phải logger instance
  level: isProduction ? 'info' : 'debug',
  transports: [
    new transports.Console({
      format: isProduction
        ? format.combine(format.timestamp(), format.json())
        : format.combine(
            format.colorize(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.printf(({ timestamp, level, message, context }) => {
              return `[Nest] ${timestamp}  ${level}: [${context || 'App'}] ${message}`;
            }),
          ),
    }),
    ...(isProduction
      ? [
          new transports.DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            format: format.combine(format.timestamp(), format.json()),
          }),
        ]
      : []),
  ],
};
