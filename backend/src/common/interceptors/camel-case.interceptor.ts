import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { camelCase, isPlainObject, mapKeys, mapValues } from 'lodash';
import { Observable } from 'rxjs';

@Injectable()
export class CamelCaseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    if (req.query && Object.keys(req.query).length > 0) {
      req.query = this.deepCamelCase(req.query);
    }

    if (req.body) {
      req.body = this.deepCamelCase(req.body);
    }

    return next.handle();
  }

  private deepCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(val => this.deepCamelCase(val));
    } else if (isPlainObject(obj)) {
      const camelCased = mapKeys(obj, (key, val) => camelCase(key));
      return mapValues(camelCased, val => this.deepCamelCase(val));
    }

    return obj;
  }
}
