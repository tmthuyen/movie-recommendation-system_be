import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface IStorageService {
  uploadFile(file: Express.Multer.File, folder?: string): Promise<string>;
  deleteFile(fileUrl: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}

@Injectable()
export class S3StorageService implements IStorageService {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3StorageService.name);
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('S3_REGION'),
      endpoint: this.configService.getOrThrow<string>('S3_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });

    this.bucket = this.configService.getOrThrow<string>('S3_BUCKET_NAME');
    this.publicUrl = this.configService.getOrThrow<string>('S3_PUBLIC_URL');
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
  ): Promise<string> {
    const fileExt = extname(file.originalname);
    const fileName = `${folder}/${uuidv4()}${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      await this.s3Client.send(command);
      return `${this.publicUrl}/${fileName}`;
    } catch (error) {
      this.logger.error(`Error uploading file to S3/R2: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const urlPath = fileUrl.replace(`${this.publicUrl}/`, '');
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: urlPath,
    });
    await this.s3Client.send(command);
  }

  async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const data = await this.s3Client.send(command);
    return data.Body as any;
  }
}
