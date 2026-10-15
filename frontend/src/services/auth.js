import { request } from './api';

/**
 * Log in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} the session user
 */
export async function login(email, password) {
  return (await request('/api/auth/login', { method: 'POST', body: { email, password } })).user;
}

/**
 * Change the password; clears the "must change password" flag.
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<object>} the updated session user
 */
export async function changePassword(userId, currentPassword, newPassword) {
  return (await request('/api/auth/password', {
    method: 'POST',
    body: { user_id: userId, current_password: currentPassword, new_password: newPassword },
  })).user;
}

/**
 * Record a logout in the audit log.
 * @param {string} actorId
 * @returns {Promise<object>}
 */
export async function logout(actorId) {
  return request('/api/auth/logout', { method: 'POST', body: { actor_id: actorId } });
}
