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
 * @param {number} allocatedHours
 * @returns {Promise<object[]>} the updated allocations
 */
export async function addAllocation(actorId, projectId, userId, allocatedHours) {
  return (await request(`/api/projects/${projectId}/allocations`, {
    method: 'POST',
    actorId,
    body: { user_id: userId, allocated_hours: allocatedHours },
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

/**
 * List a project's active milestones (with assignees).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function fetchMilestones(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/milestones`, { actorId })).milestones;
}

/**
 * Create a milestone at the end of the project's sequence.
 * @param {string} actorId
 * @param {string} projectId
 * @param {object} milestone
 * @returns {Promise<object[]>} the updated milestones
 */
export async function createMilestone(actorId, projectId, milestone) {
  return (await request(`/api/projects/${projectId}/milestones`, {
    method: 'POST', actorId, body: milestone,
  })).milestones;
}

/**
 * Update milestone fields or status.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId
 * @param {object} changes
 * @returns {Promise<object[]>} the updated milestones
 */
export async function updateMilestone(actorId, projectId, milestoneId, changes) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}`, {
    method: 'PATCH', actorId, body: changes,
  })).milestones;
}

/**
 * Archive a milestone; its employees are detached.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId
 * @returns {Promise<object[]>} the updated milestones
 */
export async function archiveMilestone(actorId, projectId, milestoneId) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}/archive`, {
    method: 'POST', actorId,
  })).milestones;
}

/**
 * Assign an allocated employee to a milestone.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId
 * @param {string} userId
 * @returns {Promise<object[]>} the updated milestones
 */
export async function assignMilestone(actorId, projectId, milestoneId, userId) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}/assignments`, {
    method: 'POST', actorId, body: { user_id: userId },
  })).milestones;
}

/**
 * Detach an employee from a milestone.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId
 * @param {string} userId
 * @returns {Promise<object[]>} the updated milestones
 */
export async function unassignMilestone(actorId, projectId, milestoneId, userId) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}/assignments/${userId}`, {
    method: 'DELETE', actorId,
  })).milestones;
}

/**
 * Make a milestone depend on another milestone of the same project.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId - the milestone that waits
 * @param {string} dependsOnId - the milestone it waits for
 * @returns {Promise<object[]>} the updated milestones (each has `depends_on`)
 */
export async function addMilestoneDependency(actorId, projectId, milestoneId, dependsOnId) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}/dependencies`, {
    method: 'POST', actorId, body: { depends_on_milestone_id: dependsOnId },
  })).milestones;
}

/**
 * Remove a milestone dependency.
 * @param {string} actorId
 * @param {string} projectId
 * @param {string} milestoneId
 * @param {string} dependsOnId
 * @returns {Promise<object[]>} the updated milestones
 */
export async function removeMilestoneDependency(actorId, projectId, milestoneId, dependsOnId) {
  return (await request(`/api/projects/${projectId}/milestones/${milestoneId}/dependencies/${dependsOnId}`, {
    method: 'DELETE', actorId,
  })).milestones;
}

/**
 * List time entries (managers/admins see all; others see their own).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function fetchTimeEntries(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/time-entries`, { actorId })).time_entries;
}

/**
 * Log the acting user's hours on a project.
 * @param {string} actorId
 * @param {string} projectId
 * @param {object} entry - {work_date, hours, milestone_id?, note?}
 * @returns {Promise<object[]>} the updated time entries
 */
export async function addTimeEntry(actorId, projectId, entry) {
  return (await request(`/api/projects/${projectId}/time-entries`, {
    method: 'POST', actorId, body: entry,
  })).time_entries;
}

/**
 * Fetch the project's budget summary (manager/admin).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object>}
 */
export async function fetchBudget(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/budget`, { actorId })).budget;
}

/**
 * List the project's expenses (manager/admin).
 * @param {string} actorId
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function fetchExpenses(actorId, projectId) {
  return (await request(`/api/projects/${projectId}/expenses`, { actorId })).expenses;
}

/**
 * Record a project expense (manager/admin).
 * @param {string} actorId
 * @param {string} projectId
 * @param {object} expense - {amount, description, incurred_on}
 * @returns {Promise<object[]>} the updated expenses
 */
export async function addExpense(actorId, projectId, expense) {
  return (await request(`/api/projects/${projectId}/expenses`, {
    method: 'POST', actorId, body: expense,
  })).expenses;
}

/**
 * Each visible employee's allocated hours across active projects, with capacity
 * (8 h per working day over their project dates) and an over-allocation flag.
 * Admins see everyone, managers their team, employees themselves.
 * @param {string} actorId
 * @returns {Promise<object[]>}
 */
export async function fetchWorkload(actorId) {
  return (await request('/api/projects/workload', { actorId })).workload;
}
