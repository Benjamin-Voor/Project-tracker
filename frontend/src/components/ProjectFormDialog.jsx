import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useIsPhone } from './responsive';
import { createProject, updateProject } from '../services/projects';

const EMPTY_FORM = {
  name: '',
  description: '',
  start_date: '',
  end_date: '',
  budget: '',
  status: 'not_started',
  manager_id: '',
};

const STATUSES = ['not_started', 'in_progress', 'completed', 'abandoned'];

/**
 * Dialog for creating (admin) or editing a project.
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.project - project to edit, or null to create
 * @param {object} props.currentUser
 * @param {object[]} props.managers - users with role "manager"
 * @param {Function} props.onClose
 * @param {Function} props.onSaved - called after a successful save
 */
function ProjectFormDialog({
  open, project, currentUser, managers, onClose, onSaved,
}) {
  const fullScreen = useIsPhone();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setError('');
    setForm(project ? {
      name: project.name,
      description: project.description || '',
      start_date: project.start_date,
      end_date: project.end_date,
      budget: project.budget == null ? '' : String(project.budget),
      status: project.status,
      manager_id: project.manager_id,
    } : EMPTY_FORM);
  }, [open, project]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    const payload = {
      name: form.name,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date,
      budget: form.budget === '' ? null : Number(form.budget),
    };
    if (isAdmin) payload.manager_id = form.manager_id;
    try {
      if (project) {
        await updateProject(currentUser.id, project.id, { ...payload, status: form.status });
      } else {
        await createProject(currentUser.id, payload);
      }
      onSaved();
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
      value={form[name]}
      onChange={handleChange}
      error={Boolean(fieldErrors[name])}
      helperText={fieldErrors[name]}
      size="small"
      {...extra}
    />
  );

  return (
    <Dialog fullScreen={fullScreen} open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {field('name', 'Name', { required: true })}
            {field('description', 'Description', { multiline: true, minRows: 2 })}
            {field('start_date', 'Start date', { type: 'date', required: true, slotProps: { inputLabel: { shrink: true } } })}
            {field('end_date', 'End date', { type: 'date', required: true, slotProps: { inputLabel: { shrink: true } } })}
            {field('budget', 'Budget', { type: 'number', slotProps: { htmlInput: { min: 0, step: '0.01' } } })}
            {project && field('status', 'Status', {
              select: true,
              children: STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>),
            })}
            {isAdmin && field('manager_id', 'Manager', {
              select: true,
              required: true,
              children: managers.length === 0
                ? [<MenuItem key="none" value="" disabled>No managers available</MenuItem>]
                : managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name} (${m.email})`}</MenuItem>
                )),
            })}
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

ProjectFormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    description: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,
    manager_id: PropTypes.string,
  }),
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
  }).isRequired,
  managers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
  })).isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

ProjectFormDialog.defaultProps = {
  project: null,
};

export default ProjectFormDialog;
