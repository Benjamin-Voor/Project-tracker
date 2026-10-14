import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { fetchUsers } from '../services/users';

const STORAGE_KEY = 'actingUserId';
const CurrentUserContext = createContext(null);

/**
 * Provides the list of users and the "acting user" chosen in the picker.
 * Stand-in for login: only the selected user's id is sent to the backend.
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 */
export function CurrentUserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(STORAGE_KEY) || '');

  const refreshUsers = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const selectUser = useCallback((id) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo(() => ({
    users,
    error,
    currentUser: users.find((u) => u.id === selectedId) || null,
    selectUser,
    refreshUsers,
  }), [users, error, selectedId, selectUser, refreshUsers]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

CurrentUserProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Access the acting user, all users, and helpers to change/refresh them.
 * @returns {{users: object[], error: string, currentUser: object|null,
 *   selectUser: Function, refreshUsers: Function}}
 */
export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
