import PropTypes from 'prop-types';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { editableFields } from './EditUserDialog';
import { hideBelowMd, hideOnXs, scrollX } from './responsive';

/**
 * Table of users with loading, error and empty states, and role-aware row actions.
 * @param {object} props
 * @param {object[]} props.users
 * @param {boolean} props.loading
 * @param {string} [props.error]
 * @param {object} props.actor - the acting user
 * @param {Function} props.onEdit
 * @param {Function} props.onArchive
 * @param {Function} props.onRestore
 */
function UserTable({
  users, loading, error, actor, onEdit, onArchive, onRestore,
}) {
  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (users.length === 0) return <Typography>No users found.</Typography>;

  return (
    <TableContainer component={Paper} sx={scrollX}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell sx={hideOnXs}>Email</TableCell>
            <TableCell>Role</TableCell>
            <TableCell sx={hideBelowMd}>Job title</TableCell>
            <TableCell align="right" sx={hideBelowMd}>Salary</TableCell>
            <TableCell sx={hideBelowMd}>Created</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const canEdit = !user.is_archived && editableFields(actor, user).length > 0;
            const canArchive = !user.is_archived && user.id !== actor.id
              && (actor.role === 'admin' || (actor.role === 'manager' && user.manager_id === actor.id));
            return (
            <TableRow key={user.id} sx={user.is_archived ? { opacity: 0.6 } : undefined}>
              <TableCell>
                {`${user.first_name} ${user.last_name}`}
                {user.is_archived && <Chip size="small" label="archived" sx={{ ml: 1 }} />}
              </TableCell>
              <TableCell sx={hideOnXs}>{user.email}</TableCell>
              <TableCell><Chip size="small" label={user.role} /></TableCell>
              <TableCell sx={hideBelowMd}>{user.job_title || '-'}</TableCell>
              <TableCell align="right" sx={hideBelowMd}>
                {user.salary == null ? '-' : Number(user.salary).toLocaleString()}
              </TableCell>
              <TableCell sx={hideBelowMd}>{new Date(user.created_at).toLocaleDateString()}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {canEdit && <Button size="small" onClick={() => onEdit(user)}>Edit</Button>}
                {canArchive && <Button size="small" onClick={() => onArchive(user)}>Archive</Button>}
                {actor.role === 'admin' && user.is_archived && (
                  <Button size="small" onClick={() => onRestore(user)}>Restore</Button>
                )}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

UserTable.propTypes = {
  users: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
    role: PropTypes.string,
    job_title: PropTypes.string,
    salary: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    manager_id: PropTypes.string,
    is_archived: PropTypes.bool,
    created_at: PropTypes.string,
  })).isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  actor: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
  }).isRequired,
  onEdit: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onRestore: PropTypes.func.isRequired,
};

UserTable.defaultProps = {
  error: '',
};

export default UserTable;
