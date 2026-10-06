import { User } from '@/shared/types/api.types';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  user: User | null;

  setAccessToken: (token: string | null) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) => set({ user }),

  clearAuth: () =>
    set({
      accessToken: null,
      user: null,
    }),
}));
