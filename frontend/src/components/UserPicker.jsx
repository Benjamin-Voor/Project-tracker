import { MenuItem, TextField } from '@mui/material';
import { useCurrentUser } from '../context/CurrentUserContext';

/**
 * Dropdown for choosing which user the app acts as (placeholder for login).
 */
function UserPicker() {
  const { users, error, currentUser, selectUser } = useCurrentUser();

  return (
    <TextField
      select
      size="small"
      label="Acting as"
      value={currentUser ? currentUser.id : ''}
      onChange={(event) => selectUser(event.target.value)}
      error={Boolean(error)}
      sx={{ minWidth: 260, bgcolor: 'background.paper', borderRadius: 1 }}
    >
      {users.length === 0 && (
        <MenuItem value="" disabled>
          {error || 'No users yet - add one on the Users tab'}
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
