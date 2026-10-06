import { ApiResponse, User } from '@/shared/types/api.types';
import axiosClient from '../lib/axiosClient';

export const authApi = {
  login: async ({
    username,
    password,
  }: {
    username: string;
    password: string;
  }): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const { data } = await axiosClient.post('/auth/login', { username, password });

    return data;
  },

  register: async (
    name: string,
    email: string,
    password: string
  ): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const { data } = await axiosClient.post('/auth/register', { name, email, password });

    return data;
  },

  loginGoogle: async (data: {
    idToken?: string;
    code?: string;
    redirectUri?: string;
  }): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const response = await axiosClient.post('/auth/login-google', data);

    return response.data;
  },

  refresh: async (): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const { data } = await axiosClient.post('/auth/refresh', null, { withCredentials: true });

    return data;
  },

  getMe: async (): Promise<ApiResponse<User>> => {
    const { data } = await axiosClient.get('/auth/me');

    return data;
  },

  logout: async (): Promise<void> => {
    return axiosClient.post('/auth/logout');
  },

  logoutBySession: async (data: { sessionId: string }): Promise<void> => {
    return axiosClient.post('/auth/logout-session', data);
  },

  logoutAll: async (): Promise<void> => {
    return axiosClient.post('/auth/logout-all');
  },
};
