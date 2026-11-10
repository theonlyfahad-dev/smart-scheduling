// ===========================================================================
// Step 5: Admin Frontend UI - Reusable API Client
// ===========================================================================

import type { ApiErrorDetail, ApiErrorResponse } from './types';

export class ApiError extends Error {
  public status: number;
  public details?: ApiErrorDetail[];

  constructor(status: number, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let inMemoryCsrfToken: string | null = null;
let onUnauthorizedHandler: (() => void) | null = null;

export const setClientCsrfToken = (token: string | null): void => {
  inMemoryCsrfToken = token;
};

export const getClientCsrfToken = (): string | null => {
  return inMemoryCsrfToken;
};

export const setOnUnauthorizedCallback = (handler: (() => void) | null): void => {
  onUnauthorizedHandler = handler;
};

export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
  }

  let json: unknown = null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      json = await res.json();
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const errorBody = json as ApiErrorResponse | null;
    const message = errorBody?.error || `Request failed with status ${res.status}`;
    const details = errorBody?.details;
    throw new ApiError(res.status, message, details);
  }

  return json as T;
}

export const apiClient = {
  setCsrfToken: setClientCsrfToken,
  getCsrfToken: getClientCsrfToken,
  setOnUnauthorized: setOnUnauthorizedCallback,

  async get<T>(endpoint: string, queryParams?: Record<string, unknown>): Promise<T> {
    const url = `/api/v1${endpoint}${buildQueryString(queryParams)}`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });
    return handleResponse<T>(res);
  },

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const url = `/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (inMemoryCsrfToken) {
      headers['X-CSRF-Token'] = inMemoryCsrfToken;
    }

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (inMemoryCsrfToken) {
      headers['X-CSRF-Token'] = inMemoryCsrfToken;
    }

    const res = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    return handleResponse<T>(res);
  },

  async delete<T>(endpoint: string): Promise<T> {
    const url = `/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (inMemoryCsrfToken) {
      headers['X-CSRF-Token'] = inMemoryCsrfToken;
    }

    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers,
    });
    return handleResponse<T>(res);
  },
};
