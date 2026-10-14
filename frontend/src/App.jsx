import { useState } from 'react';
import {
  Alert, AppBar, Button, Tab, Tabs, Toolbar, Typography,
} from '@mui/material';
import ChangePasswordDialog from './components/ChangePasswordDialog';
import UserPicker from './components/UserPicker';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';

/**
 * Navigation shell shown after login; tabs depend on the acting user's role.
 */
function Shell() {
  const {
    sessionUser, currentUser, isViewingAs, logout,
  } = useAuth();
  const [tab, setTab] = useState('projects');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const canSeeUsers = currentUser.role === 'admin';
  const activeTab = tab === 'admin' && !canSeeUsers ? 'projects' : tab;

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>Project Tracker</Typography>
          <Tabs value={activeTab} onChange={(_, value) => setTab(value)} textColor="inherit" sx={{ flexGrow: 1 }}>
            <Tab value="projects" label="Projects" />
            {canSeeUsers && <Tab value="admin" label="Users" />}
          </Tabs>
          {sessionUser.role === 'admin' && <UserPicker />}
          <Typography variant="body2">{`${sessionUser.first_name} ${sessionUser.last_name}`}</Typography>
          <Button color="inherit" onClick={() => setPasswordOpen(true)}>Password</Button>
          <Button color="inherit" onClick={logout}>Log out</Button>
        </Toolbar>
      </AppBar>
      {isViewingAs && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {`Viewing as ${currentUser.first_name} ${currentUser.last_name} (${currentUser.role}). Changes are recorded under that user.`}
        </Alert>
      )}
      {activeTab === 'admin' ? <AdminPage /> : <ProjectsPage />}
      <ChangePasswordDialog
        open={passwordOpen || sessionUser.must_change_password}
        required={sessionUser.must_change_password}
        onClose={() => setPasswordOpen(false)}
      />
    </>
  );
}

/**
 * Shows the login page until someone is logged in.
 */
function Gate() {
  const { sessionUser } = useAuth();
  return sessionUser ? <Shell /> : <LoginPage />;
}

/**
 * Application root.
 */
function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
