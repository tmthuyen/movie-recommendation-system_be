import axiosClient from '../lib/axiosClient';

export const userApi = {
  getSessions: () => axiosClient.get('/users/me/sessions'),
  updateProfile: (data: any) => axiosClient.put('/users/me', data),
  uploadAvatar: (formData: FormData) =>
    axiosClient.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Admin
  getAllUsers: async (page: number = 1, limit: number = 10) => {
    const { data } = await axiosClient.get(`/users?page=${page}&limit=${limit}`);
    return data;
  },
  getUserById: (id: number) => axiosClient.get(`/users/${id}`),
  updateUserStatus: (id: number, status: string) =>
    axiosClient.put(`/users/${id}/status`, { status }),
  createUser: (data: any) => axiosClient.post('/users', data),
  updateUserAdmin: (id: number, data: any) => axiosClient.put(`/users/${id}`, data),
  deleteUser: (id: number) => axiosClient.delete(`/users/${id}`),
};
