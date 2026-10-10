import { ApiResponse, User } from '@/shared/types/api.types';
import axiosClient from '../lib/axiosClient';

export const userApi = {
  getSessions: () => axiosClient.get('/users/me/sessions'),
  updateProfile: async (data: any): Promise<ApiResponse<User>> => {
    const { data: userData } = await axiosClient.put('/users/me', data);
    return userData;
  },
  uploadAvatar: (formData: FormData) =>
    axiosClient.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Admin
  getAllUsers: async (page: number = 1, limit: number = 10) => {
    const { data } = await axiosClient.get(`/users?page=${page}&limit=${limit}`);
    return data;
  },
  getUserById: async (id: number): Promise<ApiResponse<User>> => {
    const { data } = await axiosClient.get(`/users/${id}`);
    return data;
  },
  updateUserStatus: (id: number, status: string) =>
    axiosClient.put(`/users/${id}/status`, { status }),
  createUser: async (data: any): Promise<ApiResponse<User>> => {
    const { data: userData } = await axiosClient.post('/users', data);

    return userData;
  },
  updateUserAdmin: async (id: number, data: any): Promise<ApiResponse<User>> => {
    const { data: userData } = await axiosClient.put(`/users/${id}`, data);
    return userData;
  },
  deleteUser: async (id: number): Promise<ApiResponse<any>> => {
    return await axiosClient.delete(`/users/${id}`);
  },

  // avatar
  updateUserAvatar: async (formData: FormData): Promise<ApiResponse<string>> => {
    const { data: userData } = await axiosClient.post(`/users/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return userData;
  },
};
