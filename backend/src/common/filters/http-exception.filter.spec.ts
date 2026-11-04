import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { AppException } from '@/common/custom-exception/app-exception';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let logger: { error: jest.Mock };
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  const request = {
    method: 'GET',
    originalUrl: '/api/movies/1',
  };

  beforeEach(() => {
    logger = { error: jest.fn() };
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });

    filter = new HttpExceptionFilter(logger as never);

    host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('AppException → dùng statusCode/message/errorCode và trả envelope success=false', () => {
    const exception = new AppException(
      HttpStatus.BAD_REQUEST,
      'Dữ liệu không hợp lệ',
      'Chi tiết lỗi cho dev',
      'MY_ERROR_CODE',
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Dữ liệu không hợp lệ',
        errorCode: 'MY_ERROR_CODE',
        path: '/api/movies/1',
        timestamp: expect.any(String),
      }),
    );
    // detailMessage chỉ vào log, không trả cho client
    expect(json.mock.calls[0][0]).not.toHaveProperty('detailMessage');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ detailMessage: 'Chi tiết lỗi cho dev' }),
    );
  });

  it('HttpException với message dạng string', () => {
    const exception = new BadRequestException('Sai tham số');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sai tham số', success: false }),
    );
  });

  it('HttpException với mảng message (validation) → join bằng dấu phẩy', () => {
    const exception = new BadRequestException({
      message: ['email phải là email', 'password quá ngắn'],
      error: 'Bad Request',
    });

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'email phải là email, password quá ngắn',
        errorCode: 'Bad Request',
      }),
    );
  });

  it('HttpException không có errorCode → không có field errorCode trong response', () => {
    const exception = new BadRequestException({ message: 'x' });
    // constructor của BadRequestException tự thêm error: 'Bad Request' → xoá để test nhánh thiếu error
    (exception as unknown as { getResponse: () => unknown }).getResponse =
      () => ({
        message: 'x',
      });

    filter.catch(exception, host);

    expect(json.mock.calls[0][0]).not.toHaveProperty('errorCode');
  });
});
