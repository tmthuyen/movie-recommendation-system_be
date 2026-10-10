import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
    interface IMulter {
      File: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
      };
    }
  }
}
