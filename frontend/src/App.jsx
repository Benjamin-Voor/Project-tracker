import { useState } from 'react';
import {
  Alert, AppBar, Box, Button, Menu, MenuItem, Tab, Tabs, Toolbar, Typography,
} from '@mui/material';
import ChangePasswordDialog from './components/ChangePasswordDialog';
import EditUserDialog from './components/EditUserDialog';
import { useIsPhone } from './components/responsive';
import UserPicker from './components/UserPicker';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';

/**
 * Navigation shell shown after login; tabs depend on the acting user's role.
 */
function Shell() {
  const {
    sessionUser, currentUser, isViewingAs, logout, updateSessionUser, refreshUsers,
  } = useAuth();
  const [tab, setTab] = useState('projects');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountAnchor, setAccountAnchor] = useState(null);
  const isPhone = useIsPhone();
  const canSeeUsers = currentUser.role === 'admin' || currentUser.role === 'manager';
  const activeTab = (tab === 'admin' || tab === 'dashboard') && !canSeeUsers ? 'projects' : tab;

  return (
    <>
      <AppBar position="static">
        {/* On phones the toolbar wraps: title + account menu, then tabs, then the View-as picker. */}
        <Toolbar sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 1, py: { xs: 1, sm: 0 } }}>
          <Typography variant="h6" sx={{ mr: { sm: 2 }, flexGrow: { xs: 1, sm: 0 } }}>Project Tracker</Typography>
          <Tabs
            value={activeTab}
            onChange={(_, value) => setTab(value)}
            textColor="inherit"
            variant="scrollable"
            scrollButtons={false}
            sx={{ flexGrow: 1, order: { xs: 3, sm: 0 }, width: { xs: '100%', sm: 'auto' } }}
          >
            <Tab value="projects" label="Projects" />
            {canSeeUsers && <Tab value="dashboard" label="Dashboard" />}
            {canSeeUsers && <Tab value="admin" label={currentUser.role === 'admin' ? 'Users' : 'My team'} />}
          </Tabs>
          {sessionUser.role === 'admin' && (
            <Box sx={{ order: { xs: 4, sm: 0 }, width: { xs: '100%', sm: 'auto' } }}>
              <UserPicker />
            </Box>
          )}
          {isPhone ? (
            <>
              <Button color="inherit" onClick={(e) => setAccountAnchor(e.currentTarget)} aria-haspopup="menu">
                {`${sessionUser.first_name} \u25BE`}
              </Button>
              <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)}>
                <MenuItem onClick={() => { setAccountAnchor(null); setProfileOpen(true); }}>Profile</MenuItem>
                <MenuItem onClick={() => { setAccountAnchor(null); setPasswordOpen(true); }}>Password</MenuItem>
                <MenuItem onClick={() => { setAccountAnchor(null); logout(); }}>Log out</MenuItem>
              </Menu>
            </>
          ) : (
            <>
              <Typography variant="body2">{`${sessionUser.first_name} ${sessionUser.last_name}`}</Typography>
              <Button color="inherit" onClick={() => setProfileOpen(true)}>Profile</Button>
              <Button color="inherit" onClick={() => setPasswordOpen(true)}>Password</Button>
              <Button color="inherit" onClick={logout}>Log out</Button>
            </>
          )}
        </Toolbar>
      </AppBar>
      {isViewingAs && (
        <Alert severity="warning" sx={{ borderRadius: 0 }}>
          {`Viewing as ${currentUser.first_name} ${currentUser.last_name} (${currentUser.role}). Changes are recorded under that user.`}
        </Alert>
      )}
      {activeTab === 'admin' && <AdminPage />}
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'projects' && <ProjectsPage />}
      <ChangePasswordDialog
        open={passwordOpen || sessionUser.must_change_password}
        required={sessionUser.must_change_password}
        onClose={() => setPasswordOpen(false)}
      />
      <EditUserDialog
        open={profileOpen}
        user={currentUser}
        actor={{ ...currentUser, role: 'employee' }}
        onClose={() => setProfileOpen(false)}
        onSaved={(user) => (isViewingAs ? refreshUsers() : updateSessionUser({
          first_name: user.first_name, last_name: user.last_name, email: user.email,
        }))}
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
