const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

const DEFAULT_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
};

let accessToken: string | null = null;

const ACCESS_TOKEN_HEADER = 'Authorization';
const GENERIC_ERROR = 'サーバーでエラーが発生しました。時間をおいて再度お試しください。';

type RequestOptions = {
  auth?: boolean;
  retry?: boolean;
};

export type TokenResponse = {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
};

function buildUrl(path: string): string {
  if (!API_BASE) {
    return path;
  }
  return `${API_BASE}${path}`;
}

function sanitizeError(): Error {
  return new Error(GENERIC_ERROR);
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: DEFAULT_HEADERS,
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = (await res.json()) as TokenResponse;
    accessToken = data.access_token;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

async function request<T>(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<T> {
  const { auth = false, retry = true } = opts;

  if (auth && !accessToken) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw sanitizeError();
    }
  }

  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', DEFAULT_HEADERS['Content-Type']);
  }
  if (auth && accessToken) {
    headers.set(ACCESS_TOKEN_HEADER, `Bearer ${accessToken}`);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed && accessToken) {
      return request<T>(path, init, { auth: true, retry: false });
    }
    throw sanitizeError();
  }

  if (!response.ok) {
    throw sanitizeError();
  }

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(buildUrl('/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw sanitizeError();
  }

  const data = (await res.json()) as TokenResponse;
  accessToken = data.access_token;
}

export async function logout(): Promise<void> {
  accessToken = null;
  await fetch(buildUrl('/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: DEFAULT_HEADERS,
  });
}

export async function health(): Promise<'ok' | 'ng'> {
  try {
    const res = await fetch(buildUrl('/healthz'), { credentials: 'include' });
    if (!res.ok) {
      return 'ng';
    }
    const json = await res.json();
    return json?.status === 'ok' ? 'ok' : 'ng';
  } catch {
    return 'ng';
  }
}

export type ItemMaster = {
  code: string;
  name: string;
  unit_price: number;
};

export async function fetchItemByCode(code: string): Promise<ItemMaster | null> {
  if (!code) return null;
  try {
    const data = await request<ItemMaster>(`/items/${encodeURIComponent(code)}`, { method: 'GET' }, { auth: true });
    return data;
  } catch {
    return null;
  }
}

export type SaleLine = {
  code: string;
  name: string;
  unit_price: number;
  qty: number;
};

export type SaleRequest = {
  lines: SaleLine[];
  tax_out: number;
  tax: number;
  tax_in: number;
  device_id?: string | null;
  cashier_id?: string | null;
};

export type SaleResponse = {
  id: string;
  tax_out: number;
  tax: number;
  tax_in: number;
  created_at: string;
};

export async function submitSale(payload: SaleRequest): Promise<SaleResponse> {
  try {
    return await request<SaleResponse>(
      '/sales',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { auth: true },
    );
  } catch {
    throw sanitizeError();
  }
}

export function useAccessToken(): string | null {
  return accessToken;
}
