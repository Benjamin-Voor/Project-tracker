const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Parse a JSON response and throw an Error carrying the server message on failure.
 * @param {Response} res
 * @returns {Promise<object>}
 */
async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.fields = body.fields || {};
    throw error;
  }
  return body;
}

/**
 * Fetch users from the backend (PostgreSQL).
 * @returns {Promise<object[]>}
 */
export async function fetchUsers() {
  const body = await parse(await fetch(`${API_URL}/api/users`));
  return body.users;
}

/**
 * Create a user.
 * @param {object} user
 * @returns {Promise<object>} the created user
 */
export async function createUser(user) {
  const body = await parse(
    await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    }),
  );
  return body.user;
}
