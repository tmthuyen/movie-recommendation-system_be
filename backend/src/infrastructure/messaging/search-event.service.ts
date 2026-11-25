import { Injectable, Logger } from '@nestjs/common';
import { idUtil } from '@/common/utils/id.util';
import { normalizeKeyword } from '@/common/utils/keyword-normalizer.util';
import type { UserSearchPayloadType } from './event.types';
import { UserProducer } from './producers/user.producer';

/** Nguồn tìm kiếm ghi vào event `user.search`. */
export type SearchEventMode = 'semantic' | 'hybrid' | 'db';

/** Thông tin cần để phát event tìm kiếm của một request. */
export interface PublishSearchEventInput {
  userId?: string;
  keywordRaw?: string;
  mode: SearchEventMode;
  resultCount: number;
  correlationId?: string;
}

/** Ngữ cảnh HTTP được controller truyền xuống service; service tự quyết định phát event. */
export interface SearchEventContext {
  userId?: string;
  correlationId?: string;
  isFirstPage?: boolean;
}

@Injectable()
export class SearchEventService {
  private readonly logger = new Logger(SearchEventService.name);

  constructor(private readonly userProducer: UserProducer) {}

  /**
   * Phát đúng một event `user.search` khi có user hợp lệ và có kết quả.
   * Chuẩn hoá keyword theo chuỗi NFC → lowercase → bỏ dấu → teencode → stopword → punctuation → gộp whitespace, rồi gửi payload `{userId, mode, keywordRaw, keywordNormalized}`.
   * @returns Promise<void>; không phát event khi guest hoặc resultCount = 0, không ghi DB/Redis.
   */
  async publishIfEligible(input: PublishSearchEventInput): Promise<void> {
    const { userId, keywordRaw = '', mode, resultCount } = input;
    if (!userId || resultCount <= 0) return;

    const correlationId = input.correlationId;
    const payload: UserSearchPayloadType = {
      userId,
      mode,
      keywordRaw,
      keywordNormalized: normalizeKeyword(keywordRaw),
    };

    await this.userProducer.publishUserSearch(payload, correlationId);
    this.logger.log(
      `Đã publish user.search: userId=${userId}, mode=${mode}, correlationId=${correlationId}`,
    );
  }
}
