import { CountriesClient } from './countries-client';

export const metadata = {
  title: 'Quốc gia',
  description: 'Quản lý quốc gia xuất xứ của phim',
};

export default function Page() {
  return <CountriesClient title={metadata.title} description={metadata.description} />;
}
