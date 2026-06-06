import { request } from './http';
import type { Location } from '../types/entryExit';
import type { ILocationApi } from './interfaces';

export function getLocations(token: string) {
  return request<{ data?: Location[] } | Location[]>('/core/locations', { token });
}

export const locationApi: ILocationApi = {
  getLocations,
};
export default locationApi;
