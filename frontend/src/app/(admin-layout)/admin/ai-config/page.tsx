import { AIConfigClient } from './ai-config-client';

export const metadata = {
  title: 'Cấu hình AI',
  description: 'Quản lý trọng số gợi ý và tham số huấn luyện AI.',
};

export default function Page() {
  return <AIConfigClient />;
}
