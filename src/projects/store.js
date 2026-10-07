const projects = new Map();
const memberships = new Map();
let nextProjectNumber = 1;

function createProject(name) {
  const project = { id: `PRJ-${nextProjectNumber++}`, name };
  projects.set(project.id, project);
  memberships.set(project.id, new Set());
  return project;
}

function addMember(projectId, userId) {
  const members = memberships.get(projectId);
  if (!members) return false;
  members.add(userId);
  return true;
}

function getProject(id) {
  return projects.get(id) || null;
}

function listProjectIdsForUser(userId) {
  return Array.from(memberships.entries())
    .filter(([, members]) => members.has(userId))
    .map(([id]) => id);
}

module.exports = { createProject, addMember, getProject, listProjectIdsForUser };
