import { request } from './http';
import type { Location } from '../types/entryExit';

export function getLocations(token: string) {
  return request<{ data?: Location[] } | Location[]>('/core/locations', { token });
}
