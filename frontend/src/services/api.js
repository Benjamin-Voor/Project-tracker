const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Call the backend as the acting user and return the parsed JSON body.
 * Throws an Error (with `fields` for validation errors) on non-2xx responses.
 * @param {string} path - e.g. "/api/projects"
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body]
 * @param {string} options.actorId - id of the acting user
 * @param {Object<string, string>} [options.query] - extra query parameters
 * @returns {Promise<object>}
 */
export async function request(path, { method = 'GET', body, actorId, query = {} } = {}) {
  const params = new URLSearchParams({ actor_id: actorId, ...query });
  const res = await fetch(`${API_URL}${path}?${params}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.error || `Request failed (${res.status})`);
    error.fields = json.fields || {};
    throw error;
  }
  return json;
}
