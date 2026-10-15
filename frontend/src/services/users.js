import { request } from './api';

/**
 * Fetch the users the acting user may see (scoped by role on the server).
 * @param {string} actorId
 * @param {boolean} [includeArchived] - honoured for admins only
 * @returns {Promise<object[]>}
 */
export async function fetchUsers(actorId, includeArchived = false) {
  const query = includeArchived ? { include_archived: 'true' } : {};
  return (await request('/api/users', { actorId, query })).users;
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

/**
 * Edit a user. Employees may change their own name and email; managers also
 * job title and salary for their team; admins also the manager.
 * @param {string} actorId
 * @param {string} userId
 * @param {object} changes
 * @returns {Promise<object>} the updated user
 */
export async function updateUser(actorId, userId, changes) {
  return (await request(`/api/users/${userId}`, { method: 'PATCH', actorId, body: changes })).user;
}

/**
 * Archive a user (admin, or the employee's manager).
 * @param {string} actorId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function archiveUser(actorId, userId) {
  return (await request(`/api/users/${userId}/archive`, { method: 'POST', actorId })).user;
}

/**
 * Restore an archived user (admin only).
 * @param {string} actorId
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function restoreUser(actorId, userId) {
  return (await request(`/api/users/${userId}/restore`, { method: 'POST', actorId })).user;
}

/**
 * Fetch the newest audit log entries (admin only).
 * @param {string} actorId
 * @param {string} [entityType] - e.g. "project"; empty for all
 * @returns {Promise<object[]>}
 */
export async function fetchAuditLog(actorId, entityType = '') {
  const query = entityType ? { entity_type: entityType } : {};
  return (await request('/api/users/audit', { actorId, query })).entries;
}
