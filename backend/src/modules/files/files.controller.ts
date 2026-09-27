import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody, ApiTags, ApiOperation } from '@nestjs/swagger';

import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import {
  type IStorageService,
  STORAGE_SERVICE,
} from '@/infrastructure/storage/storage.service';

@ApiTags('Files')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  @Post('upload')
  @Roles('ADMIN', 'SUPERADMIN', 'USER')
  @ApiOperation({ summary: 'Upload file lên Object Storage (S3/R2)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(
            new BadRequestException(
              'Chỉ cho phép định dạng ảnh (jpg, png, webp)',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy file');
    }
    const url = await this.storageService.uploadFile(file, 'uploads');

    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Upload thành công',
      result: { url },
    };
  }
}
