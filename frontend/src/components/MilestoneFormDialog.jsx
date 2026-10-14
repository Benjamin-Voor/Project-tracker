import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { createMilestone, updateMilestone } from '../services/projects';

const FIELDS = ['name', 'goal', 'deliverables', 'completion_criteria', 'start_date', 'end_date'];

/**
 * Dialog for creating or editing a milestone.
 * @param {object} props
 * @param {boolean} props.open
 * @param {object} props.project
 * @param {object|null} props.milestone - null to create
 * @param {string} props.actorId
 * @param {Function} props.onClose
 * @param {Function} props.onSaved - called with the updated milestone list
 */
function MilestoneFormDialog({
  open, project, milestone, actorId, onClose, onSaved,
}) {
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(Object.fromEntries(FIELDS.map((k) => [k, milestone?.[k] ?? ''])));
      setFieldErrors({});
      setError('');
    }
  }, [open, milestone]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const result = milestone
        ? await updateMilestone(actorId, project.id, milestone.id, form)
        : await createMilestone(actorId, project.id, form);
      onSaved(result);
      onClose();
    } catch (err) {
      setFieldErrors(err.fields || {});
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name, label, extra = {}) => (
    <TextField
      name={name}
      label={label}
      value={form[name] ?? ''}
      onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
      error={Boolean(fieldErrors[name])}
      helperText={fieldErrors[name]}
      size="small"
      {...extra}
    />
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{milestone ? 'Edit milestone' : 'New milestone'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {field('name', 'Name', { required: true })}
            {field('goal', 'Goal', { multiline: true, minRows: 2 })}
            {field('deliverables', 'Deliverables', { multiline: true, minRows: 2 })}
            {field('completion_criteria', 'Completion criteria', { multiline: true, minRows: 2 })}
            <Stack direction="row" spacing={2}>
              {field('start_date', 'Start date', {
                type: 'date', required: true, fullWidth: true, slotProps: { inputLabel: { shrink: true } },
              })}
              {field('end_date', 'End date', {
                type: 'date', required: true, fullWidth: true, slotProps: { inputLabel: { shrink: true } },
              })}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>Save</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

MilestoneFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  milestone: PropTypes.shape({ id: PropTypes.string.isRequired }),
  actorId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

MilestoneFormDialog.defaultProps = {
  milestone: null,
};

export default MilestoneFormDialog;
