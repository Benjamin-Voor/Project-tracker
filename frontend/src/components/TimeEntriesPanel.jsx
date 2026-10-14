import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
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
import { addTimeEntry, fetchTimeEntries } from '../services/projects';

/**
 * Today's date as YYYY-MM-DD in local time.
 * @returns {string}
 */
function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const EMPTY_ENTRY = { hours: '', milestone_id: '', note: '' };

/**
 * Log hours on a project and list entries (own entries for team members,
 * everyone's for the manager/admin).
 * @param {object} props
 * @param {object} props.project
 * @param {object[]} props.milestones
 * @param {string} props.actorId
 * @param {boolean} props.canManage
 */
function TimeEntriesPanel({
  project, milestones, actorId, canManage,
}) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_ENTRY, work_date: today() });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setEntries(await fetchTimeEntries(actorId, project.id));
    } catch (err) {
      setError(err.message);
    }
  }, [actorId, project.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      setEntries(await addTimeEntry(actorId, project.id, form));
      setForm((prev) => ({ ...EMPTY_ENTRY, work_date: prev.work_date }));
    } catch (err) {
      setFieldErrors(err.fields || {});
      setError(err.message);
    }
  };

  const set = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));
  const total = entries.reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <>
      {!project.is_archived && (
        <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Log my time</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              type="date"
              label="Date"
              value={form.work_date}
              onChange={set('work_date')}
              required
              error={Boolean(fieldErrors.work_date)}
              helperText={fieldErrors.work_date}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }}
            />
            <TextField
              size="small"
              type="number"
              label="Hours"
              value={form.hours}
              onChange={set('hours')}
              required
              error={Boolean(fieldErrors.hours)}
              helperText={fieldErrors.hours}
              slotProps={{ htmlInput: { min: 0.25, max: 24, step: 0.25 } }}
              sx={{ width: { sm: 110 } }}
            />
            <TextField
              select
              size="small"
              label="Milestone"
              value={form.milestone_id}
              onChange={set('milestone_id')}
              error={Boolean(fieldErrors.milestone_id)}
              helperText={fieldErrors.milestone_id}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">None</MenuItem>
              {milestones.map((m) => <MenuItem key={m.id} value={m.id}>{`${m.sequence_number}. ${m.name}`}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Note" value={form.note} onChange={set('note')} sx={{ flex: 1 }} />
            <Button type="submit" variant="contained">Log</Button>
          </Stack>
        </Paper>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle1">{canManage ? 'All time entries' : 'My time entries'}</Typography>
        <Typography variant="subtitle1">{`Total: ${total} h`}</Typography>
      </Box>
      {entries.length === 0 ? <Typography>No time logged yet.</Typography> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                {canManage && <TableCell>Who</TableCell>}
                <TableCell align="right">Hours</TableCell>
                <TableCell>Milestone</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.work_date}</TableCell>
                  {canManage && <TableCell>{`${e.first_name} ${e.last_name}`}</TableCell>}
                  <TableCell align="right">{Number(e.hours)}</TableCell>
                  <TableCell>{e.milestone_name || '-'}</TableCell>
                  <TableCell>{e.note || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}

TimeEntriesPanel.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    is_archived: PropTypes.bool,
  }).isRequired,
  milestones: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    sequence_number: PropTypes.number,
    name: PropTypes.string,
  })).isRequired,
  actorId: PropTypes.string.isRequired,
  canManage: PropTypes.bool.isRequired,
};

export default TimeEntriesPanel;
