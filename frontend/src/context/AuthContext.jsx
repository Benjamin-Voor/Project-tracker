import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import * as authApi from '../services/auth';
import { fetchUsers } from '../services/users';

const STORAGE_KEY = 'sessionUser';
const AuthContext = createContext(null);

/**
 * Read the logged-in user back from sessionStorage.
 * @returns {object|null}
 */
function loadSessionUser() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Provides login state, the visible users, and the "acting" user.
 * Without tokens, only the user id is sent to the backend (`actor_id`).
 * Admins may view the app as another user; everyone else acts as themselves.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 */
export function AuthProvider({ children }) {
  const [sessionUser, setSessionUser] = useState(loadSessionUser);
  const [viewAsId, setViewAsId] = useState('');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const refreshUsers = useCallback(async () => {
    if (!sessionUser) {
      setUsers([]);
      return;
    }
    try {
      setUsers(await fetchUsers(sessionUser.id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [sessionUser]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const storeUser = useCallback((user) => {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_KEY);
    setSessionUser(user);
  }, []);

  const login = useCallback(async (email, password) => {
    storeUser(await authApi.login(email, password));
  }, [storeUser]);

  const logout = useCallback(async () => {
    if (sessionUser) await authApi.logout(sessionUser.id).catch(() => {});
    setViewAsId('');
    storeUser(null);
  }, [sessionUser, storeUser]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    storeUser(await authApi.changePassword(sessionUser.id, currentPassword, newPassword));
  }, [sessionUser, storeUser]);

  const updateSessionUser = useCallback((changes) => {
    storeUser({ ...sessionUser, ...changes });
    refreshUsers();
  }, [sessionUser, storeUser, refreshUsers]);

  const viewAs = useCallback((id) => {
    if (sessionUser?.role === 'admin') setViewAsId(id === sessionUser.id ? '' : id);
  }, [sessionUser]);

  const value = useMemo(() => {
    const viewed = sessionUser?.role === 'admin' && viewAsId
      ? users.find((u) => u.id === viewAsId)
      : null;
    return {
      sessionUser,
      currentUser: viewed || sessionUser,
      isViewingAs: Boolean(viewed),
      users,
      error,
      login,
      logout,
      changePassword,
      updateSessionUser,
      viewAs,
      refreshUsers,
    };
  }, [sessionUser, viewAsId, users, error, login, logout, changePassword, updateSessionUser,
    viewAs, refreshUsers]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Access auth state and actions.
 * @returns {{sessionUser: object|null, currentUser: object|null, isViewingAs: boolean,
 *   users: object[], error: string, login: Function, logout: Function,
 *   changePassword: Function, updateSessionUser: Function, viewAs: Function,
 *   refreshUsers: Function}}
 */
export function useAuth() {
  return useContext(AuthContext);
}
