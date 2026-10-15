import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack,
} from '@mui/material';
import { useIsPhone } from './responsive';
import PasswordField from './PasswordField';
import { useAuth } from '../context/AuthContext';

/**
 * Dialog for changing the password. When `required` is true it cannot be dismissed
 * (first login) and the user must also log out to leave it.
 * @param {object} props
 * @param {boolean} props.open
 * @param {boolean} props.required
 * @param {Function} props.onClose - called after success or cancel (optional dialogs only)
 */
function ChangePasswordDialog({ open, required = false, onClose = () => {} }) {
  const fullScreen = useIsPhone();
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await changePassword(current, next);
      reset();
      onClose();
    } catch (err) {
      setError(err.fields?.new_password ? `New password ${err.fields.new_password}` : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  return (
    <Dialog fullScreen={fullScreen} open={open} onClose={required ? undefined : handleCancel} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {required && (
              <DialogContentText>
                Choose a new password before you continue.
              </DialogContentText>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <PasswordField
              label="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
            <PasswordField
              label="New password (8+ characters)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              autoComplete="new-password"
              slotProps={{ htmlInput: { minLength: 8, maxLength: 72 } }}
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {required
            ? <Button onClick={logout} disabled={submitting}>Log out</Button>
            : <Button onClick={handleCancel} disabled={submitting}>Cancel</Button>}
          <Button type="submit" variant="contained" disabled={submitting}>Change password</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

ChangePasswordDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  required: PropTypes.bool,
  onClose: PropTypes.func,
};

export default ChangePasswordDialog;
