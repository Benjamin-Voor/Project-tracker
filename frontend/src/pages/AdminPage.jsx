import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Container, Snackbar, Typography } from '@mui/material';
import AddUserDialog from '../components/AddUserDialog';
import UserTable from '../components/UserTable';
import { useCurrentUser } from '../context/CurrentUserContext';
import { fetchUsers } from '../services/users';

/**
 * Admin page: lists users from the database and allows adding new ones.
 */
function AdminPage() {
  const { refreshUsers } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreated = (user) => {
    setNotice(`User ${user.username} created`);
    loadUsers();
    refreshUsers();
  };

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">Admin</Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>Add user</Button>
      </Box>
      <UserTable users={users} loading={loading} error={error} />
      <AddUserDialog
        open={dialogOpen}
        managers={users.filter((u) => u.role === 'manager')}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice('')}
        message={notice}
      />
    </Container>
  );
}

export default AdminPage;
