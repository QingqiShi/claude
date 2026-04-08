import type { Product, MetricData, User, Team } from '@/types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchProducts(params?: {
  category?: string;
  sort?: string;
  search?: string;
}): Promise<Product[]> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.search) searchParams.set('search', params.search);
  const query = searchParams.toString();
  return fetchJSON<Product[]>(`/products${query ? `?${query}` : ''}`);
}

export async function fetchMetrics(dateRange?: {
  start: string;
  end: string;
}): Promise<MetricData[]> {
  const searchParams = new URLSearchParams();
  if (dateRange?.start) searchParams.set('start', dateRange.start);
  if (dateRange?.end) searchParams.set('end', dateRange.end);
  const query = searchParams.toString();
  return fetchJSON<MetricData[]>(`/metrics${query ? `?${query}` : ''}`);
}

export async function fetchCurrentUser(): Promise<User> {
  return fetchJSON<User>('/user/me');
}

export async function fetchTeams(): Promise<Team[]> {
  return fetchJSON<Team[]>('/teams');
}

export async function updateUserSettings(settings: {
  displayName?: string;
  theme?: string;
  locale?: string;
}): Promise<void> {
  await fetchJSON('/user/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}
