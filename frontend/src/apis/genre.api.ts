import { ApiResponse, Genre } from '@/shared/types/api.types';
import axiosClient from '../lib/axiosClient';

export const genreApi = {
  getAll: async (): Promise<ApiResponse<Genre[]>> => {
    const { data } = await axiosClient.get('/genres');
    return data;
  },
  getById: async (id: string): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.get(`/genres/${id}`);
    return data;
  },
  create: async (genre: Partial<Genre>): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.post('/genres', genre);
    return data;
  },
  update: async (id: string, genre: Partial<Genre>): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.put(`/genres/${id}`, genre);
    return data;
  },
  delete: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/genres/${id}`);
    return data;
  },
};
