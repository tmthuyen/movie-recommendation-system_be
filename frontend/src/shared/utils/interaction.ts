/** Nhãn + màu badge theo loại tương tác. Dùng chung ở lịch sử, dashboard và admin. */
export const INTERACTION_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  click: { label: 'Đã xem', className: 'border-border text-muted-foreground' },
  like: { label: 'Yêu thích', className: 'border-red-500/30 bg-red-500/10 text-red-500' },
  rating: { label: 'Đánh giá', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' },
  comment: { label: 'Bình luận', className: 'border-primary/30 bg-primary/10 text-primary' },
};
