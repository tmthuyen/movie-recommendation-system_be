import { GenresClient } from './genres-client';

export const metadata = {
  title: 'Thể loại',
  description: 'Quản lý các nhóm thể loại phim',
};

export default function Page() {
  return <GenresClient title={metadata.title} description={metadata.description} />;
}
