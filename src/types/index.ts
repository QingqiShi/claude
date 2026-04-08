export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  team: string;
  avatarUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  memberCount: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'draft' | 'archived';
  createdAt: string;
}

export interface MetricData {
  label: string;
  value: number;
  change: number;
  unit: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY';
export type Locale = 'en-US' | 'en-GB' | 'de-DE' | 'ja-JP';
export type Theme = 'light' | 'dark';
export type SortDirection = 'asc' | 'desc';
