export const apiEndpoints = {
  auth: {
    login: "/api/auth/login",
    signup: "/api/auth/signup",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
  },
  vocabulary: {
    list: "/api/vocabulary",
    categories: "/api/vocabulary/categories",
    byId: (id: string) => `/api/vocabulary/${id}`,
  },
  profile: {
    me: "/api/profile",
  },
} as const


