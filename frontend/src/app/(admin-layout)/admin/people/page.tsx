import { PeopleClient } from './people-client';

export const metadata = {
  title: 'Diễn viên / Đạo diễn',
  description: 'Quản lý người tham gia phim',
};

export default function Page() {
  return <PeopleClient title={metadata.title} description={metadata.description} />;
}
