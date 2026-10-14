import { request } from './api';

/**
 * List projects visible to the acting user.
 * @param {string} actorId
 * @param {boolean} [includeArchived] - honoured for admins only
 * @returns {Promise<object[]>}
 */
export async function fetchProjects(actorId, includeArchived = false) {
  const query = includeArchived ? { include_archived: 'true' } : {};
  return (await request('/api/projects', { actorId, query })).projects;
}

/**
 * Create a project (admin only).
 * @param {string} actorId
 * @param {object} project
 * @returns {Promise<object>}
 */
export async function createProject(actorId, project) {
  return (await request('/api/projects', { method: 'POST', actorId, body: project })).project;
}

/**
 * Update editable project fields.
 * @param {string} actorId
 * @param {string} projectId
 * @param {object} changes
 * @returns {Promise<object>}
 */
export async function updateProject(actorId, projectId, changes) {
  return (await request(`/api/projects/${projectId}`, { method: 'PATCH', actorId, body: changes })).project;
}

/**
 * Archive a project (all milestones must be completed).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object>}
 */
export async function archiveProject(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/archive`, { method: 'POST', actorId })).project;
}

/**
 * Restore an archived project (admin only).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object>}
 */
export async function restoreProject(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/restore`, { method: 'POST', actorId })).project;
}

/**
 * List employees allocated to a project.
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function fetchAllocations(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/allocations`, { actorId })).allocations;
}

/**
 * Allocate an employee to a project.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} userId
 * @param {number} plannedHours
 * @returns {Promise<object[]>} the updated allocations
 */
export async function addAllocation(actorId, projectId, userId, plannedHours) {
  return (await request(`/api/projects/${projectId}/allocations`, {
    method: 'POST',
    actorId,
    body: { user_id: userId, planned_hours: plannedHours },
  })).allocations;
}

/**
 * Remove an employee allocation.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<object[]>} the updated allocations
 */
export async function removeAllocation(actorId, projectId, userId) {
  return (await request(`/api/projects/${projectId}/allocations/${userId}`, {
    method: 'DELETE',
    actorId,
  })).allocations;
}
