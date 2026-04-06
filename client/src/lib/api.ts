import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * PRODUCTION HARDENED: Unified Local Auth Interceptor
 */
api.interceptors.request.use((config) => {
  // Extract token from localStorage (where we saved it during login)
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
