import { request } from './api';

/**
 * Fetch the users the acting user may see (scoped by role on the server).
 * @param {string} actorId
 * @returns {Promise<object[]>}
 */
export async function fetchUsers(actorId) {
  return (await request('/api/users', { actorId })).users;
}

/**
 * Create a user (admin only). The new user must change their password at first login.
 * @param {string} actorId
 * @param {object} user
 * @returns {Promise<object>} the created user
 */
export async function createUser(actorId, user) {
  return (await request('/api/users', { method: 'POST', actorId, body: user })).user;
}
