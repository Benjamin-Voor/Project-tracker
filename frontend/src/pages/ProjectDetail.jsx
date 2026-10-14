import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Box, Button, Chip, Paper, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import BudgetPanel from '../components/BudgetPanel';
import MilestonesPanel from '../components/MilestonesPanel';
import TimeEntriesPanel from '../components/TimeEntriesPanel';
import { fetchAllocations, fetchMilestones } from '../services/projects';

/**
 * One project's detail view: milestones, time log and (for its manager or an
 * admin) the budget and expenses.
 * @param {object} props
 * @param {object} props.project
 * @param {string} props.actorId
 * @param {boolean} props.canManage
 * @param {Function} props.onBack
 * @param {Function} props.onEdit - open the project form
 * @param {Function} props.onTeam - open the team (allocations) dialog
 */
function ProjectDetail({
  project, actorId, canManage, onBack, onEdit, onTeam,
}) {
  const [tab, setTab] = useState('milestones');
  const [milestones, setMilestones] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        fetchMilestones(actorId, project.id),
        fetchAllocations(actorId, project.id),
      ]);
      setMilestones(m);
      setAllocations(a);
    } catch (err) {
      setError(err.message);
    }
  }, [actorId, project.id]);

  useEffect(() => {
    load();
  }, [load, project.allocation_count]);

  const done = milestones.filter((m) => m.status === 'completed').length;

  return (
    <>
      <Button onClick={onBack} sx={{ mb: 2 }}>&larr; All projects</Button>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" component="h1">
              {project.name}
              {project.is_archived && <Chip size="small" label="archived" sx={{ ml: 1, verticalAlign: 'middle' }} />}
            </Typography>
            <Typography color="text.secondary">
              {`Manager: ${project.manager_name} · ${project.start_date} to ${project.end_date} · ${project.status.replace('_', ' ')}`}
            </Typography>
            {project.description && <Typography sx={{ mt: 1 }}>{project.description}</Typography>}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onTeam}>{`Team (${project.allocation_count})`}</Button>
            {canManage && !project.is_archived && <Button variant="outlined" onClick={onEdit}>Edit project</Button>}
          </Stack>
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          {`${done} of ${milestones.length} milestones completed · ${project.allocated_hours} allocated hours`}
        </Typography>
      </Paper>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="milestones" label="Milestones" />
        <Tab value="time" label="Time" />
        {canManage && <Tab value="budget" label="Budget" />}
      </Tabs>
      {tab === 'milestones' && (
        <MilestonesPanel
          project={project}
          milestones={milestones}
          allocations={allocations}
          actorId={actorId}
          canManage={canManage}
          onChange={setMilestones}
        />
      )}
      {tab === 'time' && (
        <TimeEntriesPanel project={project} milestones={milestones} actorId={actorId} canManage={canManage} />
      )}
      {tab === 'budget' && canManage && (
        <BudgetPanel project={project} actorId={actorId} onEditBudget={onEdit} />
      )}
    </>
  );
}

ProjectDetail.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    description: PropTypes.string,
    manager_name: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    status: PropTypes.string,
    allocated_hours: PropTypes.number,
    allocation_count: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    is_archived: PropTypes.bool,
  }).isRequired,
  actorId: PropTypes.string.isRequired,
  canManage: PropTypes.bool.isRequired,
  onBack: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onTeam: PropTypes.func.isRequired,
};

export default ProjectDetail;
