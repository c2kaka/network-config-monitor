const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const fetchStatus = () => request('/status');
export const fetchSnapshots = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/snapshots${qs ? '?' + qs : ''}`);
};
export const createSnapshot = (description) =>
  request('/snapshots', { method: 'POST', body: JSON.stringify({ description }) });
export const deleteSnapshot = (id) =>
  request(`/snapshots/${id}`, { method: 'DELETE' });
export const fetchDiff = (id1, id2) => request(`/snapshots/${id1}/diff/${id2}`);
export const fetchChanges = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/changes${qs ? '?' + qs : ''}`);
};
export const fetchLatestChanges = (limit = 20) =>
  request(`/changes/latest?limit=${limit}`);
