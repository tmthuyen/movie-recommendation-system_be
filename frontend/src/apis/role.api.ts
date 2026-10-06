import axiosClient from './axiosClient';

export const roleApi = {
  getAllRoles: () => axiosClient.get('/roles'),
};
