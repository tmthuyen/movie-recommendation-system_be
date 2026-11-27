import { RolesClient } from './roles-client';

export const metadata = {
  title: 'Vai trò',
  description: 'Quản lý vai trò và phân quyền',
};

export default function Page() {
  return <RolesClient title={metadata.title} description={metadata.description} />;
}
