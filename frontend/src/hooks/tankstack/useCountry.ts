import { countryApi } from '@/apis/country.api';
import { useQuery } from '@tanstack/react-query';

/**
 * `GET /countries` cho các trang public/user.
 *
 * Luôn gửi `hasMovies=true` để backend chỉ trả country có ít nhất một phim
 * trong `movie_countries`; danh sách đã sort `viName ASC` + `id ASC`.
 * Admin dùng API/hook riêng, không truyền cờ này nên vẫn lấy full.
 */
export function useGetCountries(
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: ['countries', 'has-movies'],
    queryFn: async () => {
      // Lấy tối đa để đủ cho dropdown lọc và section theo country.
      const response = await countryApi.getAll({
        page: 1,
        limit: 500,
        hasMovies: true,
      });
      return response.result;
    },
    staleTime: staleTime, // 5 minutes
    gcTime: gcTime, // 10 minutes
  });
}

const useCountry = {
  useGetCountries,
};

export default useCountry;
