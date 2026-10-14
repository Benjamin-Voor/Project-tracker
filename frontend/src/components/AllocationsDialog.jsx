import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { addAllocation, fetchAllocations, removeAllocation } from '../services/projects';

/**
 * Dialog listing a project's allocated employees; managers/admins can edit it.
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.project
 * @param {string} props.actorId
 * @param {boolean} props.canManage
 * @param {object[]} props.employees - employees whose manager is the project manager
 * @param {Function} props.onClose
 * @param {Function} props.onChanged - called after an allocation is added or removed
 */
function AllocationsDialog({
  open, project, actorId, canManage, employees, onClose, onChanged,
}) {
  const [allocations, setAllocations] = useState([]);
  const [userId, setUserId] = useState('');
  const [hours, setHours] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setAllocations(await fetchAllocations(actorId, project.id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [actorId, project]);

  useEffect(() => {
    if (open && project) {
      setUserId('');
      setHours('');
      load();
    }
  }, [open, project, load]);

  const run = async (action) => {
    try {
      setAllocations(await action());
      setError('');
      onChanged();
    } catch (err) {
      setError(err.fields?.user_id || err.message);
    }
  };

  const handleAdd = (event) => {
    event.preventDefault();
    run(async () => {
      const result = await addAllocation(actorId, project.id, userId, Number(hours));
      setUserId('');
      setHours('');
      return result;
    });
  };

  const allocatedIds = new Set(allocations.map((a) => a.user_id));
  const available = employees.filter((e) => !allocatedIds.has(e.id));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{project ? `Team: ${project.name}` : 'Team'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {allocations.length === 0 ? (
          <Typography>No employees allocated.</Typography>
        ) : (
          <List dense>
            {allocations.map((a) => (
              <ListItem
                key={a.user_id}
                secondaryAction={canManage && (
                  <Button size="small" onClick={() => run(() => removeAllocation(actorId, project.id, a.user_id))}>
                    Remove
                  </Button>
                )}
              >
                <ListItemText
                  primary={`${a.first_name} ${a.last_name} (${a.username})`}
                  secondary={`${Number(a.planned_hours)} planned hours${a.job_title ? ` - ${a.job_title}` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        )}
        {canManage && (
          <Box component="form" onSubmit={handleAdd} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label="Employee"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                sx={{ flex: 1 }}
              >
                {available.length === 0
                  ? <MenuItem value="" disabled>No available employees on this manager&apos;s team</MenuItem>
                  : available.map((e) => (
                    <MenuItem key={e.id} value={e.id}>{`${e.first_name} ${e.last_name} (${e.username})`}</MenuItem>
                  ))}
              </TextField>
              <TextField
                size="small"
                type="number"
                label="Planned hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
                slotProps={{ htmlInput: { min: 0, step: '0.5' } }}
                sx={{ width: 150 }}
              />
              <Button type="submit" variant="contained">Add</Button>
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

AllocationsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
  }),
  actorId: PropTypes.string.isRequired,
  canManage: PropTypes.bool.isRequired,
  employees: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    username: PropTypes.string,
  })).isRequired,
  onClose: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
};

AllocationsDialog.defaultProps = {
  project: null,
};

export default AllocationsDialog;
