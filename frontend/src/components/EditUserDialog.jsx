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
import { updateUser } from '../services/users';

/**
 * Which fields the actor may edit on this user (mirrors the backend rules).
 * @param {object} actor
 * @param {object} user
 * @returns {string[]}
 */
export function editableFields(actor, user) {
  const self = ['first_name', 'last_name', 'email'];
  const team = [...self, 'job_title', 'salary'];
  if (actor.role === 'admin') return user.role === 'employee' ? [...team, 'manager_id'] : team;
  if (actor.role === 'manager' && user.manager_id === actor.id) return team;
  if (actor.id === user.id) return self;
  return [];
}

const LABELS = {
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  job_title: 'Job title',
  salary: 'Salary',
  manager_id: 'Manager',
};

/**
 * Dialog for editing a user; shows only the fields the actor may change.
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} props.user - the user being edited
 * @param {object} props.actor - the acting user
 * @param {object[]} props.managers - active managers (for admins changing an employee's manager)
 * @param {Function} props.onClose
 * @param {Function} props.onSaved - called with the updated user
 */
function EditUserDialog({
  open, user = null, actor, managers = [], onClose, onSaved,
}) {
  const [form, setForm] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fields = user ? editableFields(actor, user) : [];

  useEffect(() => {
    if (open && user) {
      setForm(Object.fromEntries(Object.keys(LABELS).map((k) => [k, user[k] ?? ''])));
      setFieldErrors({});
      setError('');
    }
  }, [open, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const changes = Object.fromEntries(fields
        .filter((k) => String(form[k] ?? '') !== String(user[k] ?? ''))
        .map((k) => [k, form[k]]));
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      onSaved(await updateUser(actor.id, user.id, changes));
      onClose();
    } catch (err) {
      setFieldErrors(err.fields || {});
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const extra = {
    email: { type: 'email', required: true },
    first_name: { required: true },
    last_name: { required: true },
    salary: { type: 'number', slotProps: { htmlInput: { min: 0, step: '0.01' } } },
    manager_id: {
      select: true,
      required: true,
      children: managers.map((m) => (
        <MenuItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name} (${m.email})`}</MenuItem>
      )),
    },
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{user && actor.id === user.id ? 'My profile' : 'Edit user'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {fields.map((name) => (
              <TextField
                key={name}
                name={name}
                label={LABELS[name]}
                value={form[name] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
                error={Boolean(fieldErrors[name])}
                helperText={fieldErrors[name]}
                size="small"
                {...extra[name]}
              />
            ))}
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

EditUserDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string,
    manager_id: PropTypes.string,
  }),
  actor: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
  }).isRequired,
  managers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
  })),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

export default EditUserDialog;
