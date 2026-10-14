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
import ProjectFormDialog from '../components/ProjectFormDialog';
import ProjectTable, { canManageProject } from '../components/ProjectTable';
import { useCurrentUser } from '../context/CurrentUserContext';
import { archiveProject, fetchProjects, restoreProject } from '../services/projects';

/**
 * Projects page: role-aware list with create, edit, archive and team allocation.
 */
function ProjectsPage() {
  const { users, currentUser } = useCurrentUser();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [teamProject, setTeamProject] = useState(null);
  const [notice, setNotice] = useState('');

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

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
      {loading ? <CircularProgress /> : (
        <ProjectTable
          projects={projects}
          currentUser={currentUser}
          onEdit={openForm}
          onAllocations={setTeamProject}
          onArchive={(p) => runAction(() => archiveProject(actorId, p.id), `Archived ${p.name}`)}
          onRestore={(p) => runAction(() => restoreProject(actorId, p.id), `Restored ${p.name}`)}
        />
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
