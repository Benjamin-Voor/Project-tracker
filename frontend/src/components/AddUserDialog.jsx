import { useState } from 'react';
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
import { createUser } from '../services/users';

const EMPTY_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'employee',
  job_title: '',
  salary: '',
  manager_id: '',
};

/**
 * Dialog form for creating a user.
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.actorId - the acting admin
 * @param {object[]} props.managers - users with role "manager"
 * @param {Function} props.onClose
 * @param {Function} props.onCreated - called with the created user
 */
function AddUserDialog({ open, actorId, managers, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError('');
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const payload = { ...form };
      if (payload.role !== 'employee') delete payload.manager_id;
      const user = await createUser(actorId, payload);
      onCreated(user);
      handleClose();
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
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {field('username', 'Username (6 characters)', {
              required: true,
              slotProps: { htmlInput: { maxLength: 6, minLength: 6 } },
            })}
            {field('first_name', 'First name', { required: true })}
            {field('last_name', 'Last name', { required: true })}
            {field('email', 'Email', { required: true, type: 'email' })}
            {field('password', 'Temporary password', { required: true, type: 'password' })}
            {field('role', 'Role', { select: true, required: true, children: [
              <MenuItem key="admin" value="admin">Admin</MenuItem>,
              <MenuItem key="manager" value="manager">Manager</MenuItem>,
              <MenuItem key="employee" value="employee">Employee</MenuItem>,
            ] })}
            {form.role === 'employee' && field('manager_id', 'Manager', {
              select: true,
              required: true,
              children: managers.length === 0
                ? [<MenuItem key="none" value="" disabled>No managers available</MenuItem>]
                : managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name} (${m.username})`}</MenuItem>
                )),
            })}
            {field('job_title', 'Job title')}
            {field('salary', 'Salary', { type: 'number', slotProps: { htmlInput: { min: 0, step: '0.01' } } })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>Create</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

AddUserDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  actorId: PropTypes.string.isRequired,
  managers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    username: PropTypes.string,
  })).isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

export default AddUserDialog;
