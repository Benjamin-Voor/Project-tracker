import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import MilestoneFormDialog from './MilestoneFormDialog';
import {
  archiveMilestone, assignMilestone, unassignMilestone, updateMilestone,
} from '../services/projects';

const STATUSES = [
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
];
const STATUS_COLORS = { not_started: 'default', in_progress: 'primary', completed: 'success' };

/**
 * Milestones of one project. Managers/admins create, edit, change status,
 * assign allocated employees and archive (which detaches the assignees).
 * @param {object} props
 * @param {object} props.project
 * @param {object[]} props.milestones
 * @param {object[]} props.allocations - employees allocated to the project
 * @param {string} props.actorId
 * @param {boolean} props.canManage
 * @param {Function} props.onChange - called with the updated milestone list
 */
function MilestonesPanel({
  project, milestones, allocations, actorId, canManage, onChange,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const editable = canManage && !project.is_archived;

  const run = async (action) => {
    setError('');
    try {
      onChange(await action());
    } catch (err) {
      setError(err.fields?.user_id || err.message);
    }
  };

  const openForm = (milestone) => {
    setEditing(milestone);
    setFormOpen(true);
  };

  return (
    <>
      {editable && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" onClick={() => openForm(null)}>New milestone</Button>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {milestones.length === 0 ? <Typography>No milestones yet.</Typography> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Milestone</TableCell>
                <TableCell>Planned</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assignees</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {milestones.map((m) => {
                const assignedIds = new Set(m.assignees.map((a) => a.user_id));
                const available = allocations.filter((a) => !assignedIds.has(a.user_id));
                return (
                  <TableRow key={m.id} sx={{ verticalAlign: 'top' }}>
                    <TableCell>{m.sequence_number}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography>
                      {m.goal && <Typography variant="caption" color="text.secondary">{m.goal}</Typography>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {`${m.start_date} to ${m.end_date}`}
                      {m.actual_start_date && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {`Actual: ${m.actual_start_date}${m.actual_end_date ? ` to ${m.actual_end_date}` : ''}`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <TextField
                          select
                          size="small"
                          value={m.status}
                          onChange={(e) => run(() => updateMilestone(actorId, project.id, m.id, { status: e.target.value }))}
                          sx={{ minWidth: 140 }}
                        >
                          {STATUSES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                        </TextField>
                      ) : (
                        <Chip size="small" color={STATUS_COLORS[m.status]} label={m.status.replace('_', ' ')} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mb: editable ? 1 : 0 }}>
                        {m.assignees.length === 0 && <Typography variant="caption">None</Typography>}
                        {m.assignees.map((a) => (
                          <Chip
                            key={a.user_id}
                            size="small"
                            label={`${a.first_name} ${a.last_name}`}
                            onDelete={editable
                              ? () => run(() => unassignMilestone(actorId, project.id, m.id, a.user_id))
                              : undefined}
                          />
                        ))}
                      </Stack>
                      {editable && available.length > 0 && (
                        <TextField
                          select
                          size="small"
                          label="Assign"
                          value=""
                          onChange={(e) => run(() => assignMilestone(actorId, project.id, m.id, e.target.value))}
                          sx={{ minWidth: 160 }}
                        >
                          {available.map((a) => (
                            <MenuItem key={a.user_id} value={a.user_id}>{`${a.first_name} ${a.last_name}`}</MenuItem>
                          ))}
                        </TextField>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {editable && <Button size="small" onClick={() => openForm(m)}>Edit</Button>}
                      {editable && (
                        <Button size="small" onClick={() => run(() => archiveMilestone(actorId, project.id, m.id))}>
                          Archive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {editable && allocations.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Add employees to the project team before assigning them to milestones.
        </Typography>
      )}
      <MilestoneFormDialog
        open={formOpen}
        project={project}
        milestone={editing}
        actorId={actorId}
        onClose={() => setFormOpen(false)}
        onSaved={onChange}
      />
    </>
  );
}

MilestonesPanel.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    is_archived: PropTypes.bool,
  }).isRequired,
  milestones: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    sequence_number: PropTypes.number,
    name: PropTypes.string,
    goal: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    actual_start_date: PropTypes.string,
    actual_end_date: PropTypes.string,
    status: PropTypes.string,
    assignees: PropTypes.arrayOf(PropTypes.shape({
      user_id: PropTypes.string.isRequired,
      first_name: PropTypes.string,
      last_name: PropTypes.string,
    })),
  })).isRequired,
  allocations: PropTypes.arrayOf(PropTypes.shape({
    user_id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
  })).isRequired,
  actorId: PropTypes.string.isRequired,
  canManage: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default MilestonesPanel;
