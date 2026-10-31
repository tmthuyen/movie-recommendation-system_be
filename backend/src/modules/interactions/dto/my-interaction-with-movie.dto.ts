import { Rating } from '@/modules/ratings/entities/rating.entity';

export interface MyInteractionsWithMovie {
  isLiked: boolean;
  click: boolean;
  commentCount: number;
  rating: Rating | null;
}
