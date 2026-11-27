import { MoviesClient } from './movies-client';

export const metadata = {
  title: 'Phim',
  description: 'Quản lý phim',
};

export default function Page() {
  return <MoviesClient title={metadata.title} description={metadata.description} />;
}
