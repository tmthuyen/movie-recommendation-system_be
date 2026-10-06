import { ApiResponse, User } from '@/shared/types/api.types';
import axiosClient from './axiosClient';

export const authApi = {
  login: async (
    email: string,
    password: string
  ): Promise<ApiResponse<{ access_token: string; refresh_token: string; user: User }>> => {
    const { data } = await axiosClient.post('/auth/login', { email, password });

    return data;
  },

  register: async (
    name: string,
    email: string,
    password: string
  ): Promise<ApiResponse<{ access_token: string; refresh_token: string; user: User }>> => {
    const { data } = await axiosClient.post('/auth/register', { name, email, password });

    return data;
  },

  loginGoogle: async (data: {
    idToken?: string;
    code?: string;
    redirectUri?: string;
  }): Promise<ApiResponse<{ access_token: string; refresh_token: string; user: User }>> => {
    const response = await axiosClient.post('/auth/login-google', data);

    return response.data;
  },

  refresh: async (): Promise<ApiResponse<{ access_token: string; refresh_token: string }>> => {
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
};
