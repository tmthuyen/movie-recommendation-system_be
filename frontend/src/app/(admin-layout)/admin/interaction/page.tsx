import { InteractionClient } from './interaction-client';

export const metadata = {
  title: 'Tương tác',
  description: 'Theo dõi tương tác, đánh giá và bình luận của người dùng',
};

export default function Page() {
  return <InteractionClient title={metadata.title} description={metadata.description} />;
}
