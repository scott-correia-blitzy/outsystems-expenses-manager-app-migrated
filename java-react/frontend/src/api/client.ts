import { ApiError, MESSAGES } from './types';
import type { DownloadedFile, ErrorBody, FieldError } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const SESSION_URL = '/api/auth/me';
const NETWORK_ERROR = 'NETWORK_ERROR';
const ABORTED = 'ABORTED';
const UNEXPECTED_RESPONSE = 'UNEXPECTED_RESPONSE';

type Unchecked<T> = { [K in keyof T]?: unknown };

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) {
      const value = cookie.slice(prefix.length);
      if (value === '') {
        return null;
      }
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

async function csrfToken(): Promise<string | null> {
  const token = readCookie(CSRF_COOKIE);
  if (token !== null) {
    return token;
  }
  // Any response, even a 401, sets the token cookie; draining the body frees the connection.
  await fetch(SESSION_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then((response) => response.text())
    .catch(() => '');
  return readCookie(CSRF_COOKIE);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject<T>(value: unknown): value is Unchecked<T> {
  return typeof value === 'object' && value !== null;
}

function isFieldError(value: unknown): value is FieldError {
  return isObject<FieldError>(value) && typeof value.field === 'string' && typeof value.message === 'string';
}

function toApiError(status: number, text: string): ApiError {
  const body = parseJson(text);
  if (isObject<ErrorBody>(body) && typeof body.message === 'string') {
    return new ApiError(
      typeof body.status === 'number' ? body.status : status,
      typeof body.code === 'string' ? body.code : UNEXPECTED_RESPONSE,
      body.message,
      Array.isArray(body.fieldErrors) ? body.fieldErrors.filter(isFieldError) : [],
    );
  }
  return new ApiError(status, UNEXPECTED_RESPONSE, MESSAGES.GENERIC_ERROR);
}

async function send<B>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<B>,
): Promise<{ response: Response; body: B }> {
  try {
    const response = await fetch(url, init);
    return { response, body: await read(response) };
  } catch {
    throw new ApiError(0, init.signal?.aborted ? ABORTED : NETWORK_ERROR, MESSAGES.GENERIC_ERROR);
  }
}

export async function request<T>(method: HttpMethod, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET') {
    // The token rotates at login and is cleared at logout, so it is read for every write.
    const token = await csrfToken();
    if (token !== null) {
      headers[CSRF_HEADER] = token;
    }
  }

  const { response, body: text } = await send(
    url,
    { method, credentials: 'same-origin', headers, body: payload, signal },
    (received) => received.text(),
  );
  if (!response.ok) {
    throw toApiError(response.status, text);
  }
  if (response.status === 204 || text === '') {
    return undefined as T;
  }
  const data = parseJson(text);
  if (data === undefined) {
    throw new ApiError(response.status, UNEXPECTED_RESPONSE, MESSAGES.GENERIC_ERROR);
  }
  return data as T;
}

// A quoted value may itself hold ';', so it is matched whole.
const DISPOSITION_PARAM = /;\s*([^\s=;]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;

function decodeExtendedValue(value: string): string | null {
  const match = /^UTF-8'[^']*'(.+)$/i.exec(value);
  if (match === null) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return value;
}

// filename* holds a non-ASCII name exactly, while filename then holds only an ASCII stand-in.
function attachmentFilename(header: string | null): string | null {
  let plain: string | null = null;
  for (const [, name, value] of (header ?? '').matchAll(DISPOSITION_PARAM)) {
    const key = name.toLowerCase();
    if (key === 'filename*') {
      const exact = decodeExtendedValue(value.trim());
      if (exact) {
        return exact;
      }
    } else if (key === 'filename') {
      plain = unquote(value.trim());
    }
  }
  return plain || null;
}

export async function download(url: string): Promise<DownloadedFile> {
  const { response, body } = await send<Blob | string>(
    url,
    { method: 'GET', credentials: 'same-origin' },
    (received) => (received.ok ? received.blob() : received.text()),
  );
  if (typeof body === 'string') {
    throw toApiError(response.status, body);
  }
  return { blob: body, filename: attachmentFilename(response.headers.get('Content-Disposition')) };
}
