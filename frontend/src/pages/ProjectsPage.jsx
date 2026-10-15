import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControlLabel,
  Snackbar,
  Switch,
  Typography,
} from '@mui/material';
import AllocationsDialog from '../components/AllocationsDialog';
import FilterBar, { matchesSearch } from '../components/FilterBar';
import ProjectFormDialog from '../components/ProjectFormDialog';
import ProjectTable, { canManageProject, riskOf } from '../components/ProjectTable';
import { useAuth } from '../context/AuthContext';
import { archiveProject, fetchProjects, restoreProject } from '../services/projects';
import ProjectDetail from './ProjectDetail';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'completed', 'abandoned']
  .map((s) => ({ value: s, label: s.replace('_', ' ') }));
const RISK_OPTIONS = [
  { value: 'late', label: 'Late' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'on_track', label: 'On track' },
  { value: 'closed', label: 'Closed' },
];
const EMPTY_FILTERS = { status: '', manager: '', risk: '' };

/**
 * Client-side project filter over the loaded list.
 * @param {object[]} projects
 * @param {string} search - matched against name and description
 * @param {{status: string, manager: string, risk: string}} filters - '' means all
 * @returns {object[]}
 */
function filterProjects(projects, search, filters) {
  return projects.filter((p) => matchesSearch(search, [p.name, p.description])
    && (!filters.status || p.status === filters.status)
    && (!filters.manager || p.manager_id === filters.manager)
    && (!filters.risk || riskOf(p) === filters.risk));
}

/**
 * Projects page: role-aware list with create, edit, archive and team allocation;
 * "Open" shows one project's milestones, time log and budget.
 */
function ProjectsPage() {
  const { users, currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [teamProject, setTeamProject] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const actorId = currentUser?.id;
  const isAdmin = currentUser?.role === 'admin';

  const loadProjects = useCallback(async () => {
    if (!actorId) return;
    setLoading(true);
    setError('');
    try {
      setProjects(await fetchProjects(actorId, isAdmin && includeArchived));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actorId, isAdmin, includeArchived]);

  useEffect(() => {
    setProjects([]);
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    setOpenId(null);
  }, [actorId]);

  if (!currentUser) {
    return <Container sx={{ py: 4 }}><Alert severity="info">Choose a user in &quot;Acting as&quot; to continue.</Alert></Container>;
  }

  const runAction = async (action, message) => {
    try {
      await action();
      setNotice(message);
      loadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const openForm = (project) => {
    setEditing(project);
    setFormOpen(true);
  };

  const teamProjectCurrent = teamProject
    ? projects.find((p) => p.id === teamProject.id) || teamProject
    : null;
  const openProject = projects.find((p) => p.id === openId) || null;

  const managerOptions = [...new Map(projects
    .filter((p) => p.manager_id)
    .map((p) => [p.manager_id, { value: p.manager_id, label: p.manager_name || p.manager_id }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  // The risk filter appears once the projects API returns `at_risk`.
  const hasRisk = projects.some((p) => p.at_risk !== undefined);
  const filterDefs = [
    { key: 'status', label: 'Status', value: filters.status, options: STATUS_OPTIONS },
    { key: 'manager', label: 'Manager', value: filters.manager, options: managerOptions },
    ...(hasRisk ? [{ key: 'risk', label: 'Risk', value: filters.risk, options: RISK_OPTIONS }] : []),
  ];
  const visibleProjects = filterProjects(projects, search, filters);

  return (
    <Container sx={{ py: 4 }}>
      {openProject ? (
        <ProjectDetail
          project={openProject}
          actorId={actorId}
          canManage={canManageProject(currentUser, openProject)}
          onBack={() => setOpenId(null)}
          onEdit={() => openForm(openProject)}
          onTeam={() => setTeamProject(openProject)}
        />
      ) : (
      <>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 3,
      }}
      >
        <Typography variant="h4" component="h1">Projects</Typography>
        <Box>
          {isAdmin && (
            <FormControlLabel
              control={<Switch checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />}
              label="Show archived"
            />
          )}
          {isAdmin && <Button variant="contained" onClick={() => openForm(null)}>New project</Button>}
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search name or description"
        filters={filterDefs}
        onFilterChange={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onClear={() => { setSearch(''); setFilters(EMPTY_FILTERS); }}
        shown={visibleProjects.length}
        total={projects.length}
      />
      {loading ? <CircularProgress /> : (
        <ProjectTable
          projects={visibleProjects}
          currentUser={currentUser}
          onOpen={(p) => setOpenId(p.id)}
          onEdit={openForm}
          onAllocations={setTeamProject}
          onArchive={(p) => runAction(() => archiveProject(actorId, p.id), `Archived ${p.name}`)}
          onRestore={(p) => runAction(() => restoreProject(actorId, p.id), `Restored ${p.name}`)}
        />
      )}
      </>
      )}
      <ProjectFormDialog
        open={formOpen}
        project={editing}
        currentUser={currentUser}
        managers={users.filter((u) => u.role === 'manager')}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setNotice('Project saved'); loadProjects(); }}
      />
      <AllocationsDialog
        open={Boolean(teamProjectCurrent)}
        project={teamProjectCurrent}
        actorId={actorId}
        canManage={teamProjectCurrent ? canManageProject(currentUser, teamProjectCurrent) : false}
        employees={teamProjectCurrent
          ? users.filter((u) => u.role === 'employee' && u.manager_id === teamProjectCurrent.manager_id)
          : []}
        onClose={() => setTeamProject(null)}
        onChanged={loadProjects}
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    </Container>
  );
}

export default ProjectsPage;
