import { MenuItem, TextField } from '@mui/material';
import { useAuth } from '../context/AuthContext';

/**
 * Admin-only dropdown for viewing the app as another user (demos).
 * Role checks stay in the UI; the backend still looks up the role by id.
 */
function UserPicker() {
  const { users, error, currentUser, viewAs } = useAuth();

  return (
    <TextField
      select
      size="small"
      label="View as"
      value={currentUser ? currentUser.id : ''}
      onChange={(event) => viewAs(event.target.value)}
      error={Boolean(error)}
      sx={{ minWidth: 260, bgcolor: 'background.paper', borderRadius: 1 }}
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
