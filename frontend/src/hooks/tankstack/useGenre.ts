import { genreApi } from '@/apis/genre.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { toast } from 'sonner';

// get all
export function useGetAll(staleTime: number = 1000 * 60 * 5, gcTime: number = 1000 * 60 * 10) {
  return useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const response = await genreApi.getAll();
      return response.result;
    },
    staleTime: staleTime, // 5 minutes
    gcTime: gcTime, // 10 minutes,
  });
}

// create genre
export function useCreateGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await genreApi.create(data);
      return response.result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['genres'] });
    },
    onError: (error: any) => {
      const parsedError = parseAxiosError(error);
      toast.error(`Lỗi: ${parsedError.message || 'Vui lòng thử lại.'}`);
    },
  });
}
const useGenre = {
  useGetAll,
  useCreateGenre,
};

export default useGenre;
