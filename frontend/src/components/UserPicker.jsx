import { InputAdornment, MenuItem, TextField } from '@mui/material';
import { useAuth } from '../context/AuthContext';

/**
 * Admin-only dropdown for viewing the app as another user (demos).
 * Role checks stay in the UI; the backend still looks up the role by id.
 */
function UserPicker() {
  const { users, error, currentUser, viewAs } = useAuth();
  // MUI warns when the value has no matching option, e.g. before users load.
  const value = users.some((user) => user.id === currentUser?.id) ? currentUser.id : '';

  return (
    <TextField
      select
      size="small"
      value={value}
      onChange={(event) => viewAs(event.target.value)}
      error={Boolean(error)}
      slotProps={{
        htmlInput: { 'aria-label': 'View as' },
        input: {
          startAdornment: <InputAdornment position="start">View as</InputAdornment>,
          sx: { bgcolor: 'background.paper' },
        },
      }}
      sx={{ width: 300, minWidth: 180, flexShrink: 1 }}
    >
      {users.length === 0 && (
        <MenuItem value="" disabled>
          {error || 'No users'}
        </MenuItem>
      )}
      {users.map((user) => (
        <MenuItem key={user.id} value={user.id}>
          {`${user.first_name} ${user.last_name} (${user.role})`}
        </MenuItem>
      ))}
    </TextField>
  );
}

export default UserPicker;
