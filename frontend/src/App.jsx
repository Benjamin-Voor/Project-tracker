import { useState } from 'react';
import {
  AppBar, Tab, Tabs, Toolbar, Typography,
} from '@mui/material';
import UserPicker from './components/UserPicker';
import { CurrentUserProvider, useCurrentUser } from './context/CurrentUserContext';
import AdminPage from './pages/AdminPage';
import ProjectsPage from './pages/ProjectsPage';

/**
 * Navigation shell: tabs depend on the acting user's role.
 */
function Shell() {
  const { users, currentUser } = useCurrentUser();
  const [tab, setTab] = useState('projects');
  // With no users at all, anyone may open Users to create the first admin.
  const canSeeUsers = currentUser?.role === 'admin' || users.length === 0;
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
          <UserPicker />
        </Toolbar>
      </AppBar>
      {activeTab === 'admin' ? <AdminPage /> : <ProjectsPage />}
    </>
  );
}

/**
 * Application root.
 */
function App() {
  return (
    <CurrentUserProvider>
      <Shell />
    </CurrentUserProvider>
  );
}

export default App;
