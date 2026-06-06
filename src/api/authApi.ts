import { request } from './http';
import type { AuthResponse, User } from '../types/entryExit';
import type { IAuthApi } from './interfaces';

export function login(payload: { email: string; password: string; device_name: string }) {
  return request<AuthResponse>('/auth/login', { method: 'POST', body: payload });
}

export function me(token: string) {
  return request<User>('/auth/me', { token });
}

export function logout(token: string) {
  return request<{ message?: string }>('/auth/logout', { method: 'POST', token });
}

export const authApi: IAuthApi = {
  login,
  me,
  logout,
};
export default authApi;
