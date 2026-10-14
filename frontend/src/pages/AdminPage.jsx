import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Container, FormControlLabel, Snackbar, Switch, Tab, Tabs, Typography,
} from '@mui/material';
import AddUserDialog from '../components/AddUserDialog';
import AuditLogTable from '../components/AuditLogTable';
import EditUserDialog from '../components/EditUserDialog';
import UserTable from '../components/UserTable';
import { useAuth } from '../context/AuthContext';
import { archiveUser, fetchUsers, restoreUser } from '../services/users';

/**
 * Users page. Admins manage everyone and see the audit log; managers edit and
 * archive the employees on their team.
 */
function AdminPage() {
  const { currentUser, refreshUsers } = useAuth();
  const actorId = currentUser.id;
  const isAdmin = currentUser.role === 'admin';
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await fetchUsers(actorId, isAdmin && includeArchived));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actorId, isAdmin, includeArchived]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const changed = (message) => {
    setNotice(message);
    loadUsers();
    refreshUsers();
  };

  const runAction = async (action, message) => {
    setActionError('');
    try {
      await action();
      changed(message);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const managers = users.filter((u) => u.role === 'manager' && !u.is_archived);

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">{isAdmin ? 'Admin' : 'My team'}</Typography>
        {isAdmin && tab === 'users' && (
          <Box>
            <FormControlLabel
              control={<Switch checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />}
              label="Show archived"
            />
            <Button variant="contained" onClick={() => setDialogOpen(true)}>Add user</Button>
          </Box>
        )}
      </Box>
      {isAdmin && (
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab value="users" label="Users" />
          <Tab value="audit" label="Audit log" />
        </Tabs>
      )}
      {tab === 'audit' && isAdmin ? <AuditLogTable actorId={actorId} /> : (
        <>
          {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>{actionError}</Alert>}
          <UserTable
            users={users}
            loading={loading}
            error={error}
            actor={currentUser}
            onEdit={setEditing}
            onArchive={(u) => runAction(() => archiveUser(actorId, u.id), `Archived ${u.first_name} ${u.last_name}`)}
            onRestore={(u) => runAction(() => restoreUser(actorId, u.id), `Restored ${u.first_name} ${u.last_name}`)}
          />
        </>
      )}
      <AddUserDialog
        open={dialogOpen}
        actorId={actorId}
        managers={managers}
        onClose={() => setDialogOpen(false)}
        onCreated={(user) => changed(`User created. They sign in with ${user.email}`)}
      />
      <EditUserDialog
        open={Boolean(editing)}
        user={editing}
        actor={currentUser}
        managers={managers}
        onClose={() => setEditing(null)}
        onSaved={(user) => changed(`Saved ${user.first_name} ${user.last_name}`)}
      />
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice('')}
        message={notice}
      />
    </Container>
  );
}

export default AdminPage;
