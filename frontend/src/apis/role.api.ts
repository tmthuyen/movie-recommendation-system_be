import axiosClient from '../lib/axiosClient';

export const roleApi = {
  getAllRoles: () => axiosClient.get('/roles'),
};
