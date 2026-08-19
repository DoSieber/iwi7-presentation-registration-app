const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch {
    throw new ApiError('network', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) throw new ApiError((data && data.error) || 'http_error', res.status);
  return data;
}

export function fetchSessions() {
  return request('/api/sessions', { method: 'GET', headers: { Accept: 'application/json' } });
}

export function submitRegistration(payload) {
  return request('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
}

export { ApiError };
