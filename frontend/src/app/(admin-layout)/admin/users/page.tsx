import { UsersClient } from './users-client';

export const metadata = {
  title: 'Người dùng',
  description: 'Quản lý người dùng',
};

export default function Page() {
  return <UsersClient title={metadata.title} description={metadata.description} />;
}
