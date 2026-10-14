import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { fetchAuditLog } from '../services/users';

const ENTITY_TYPES = ['', 'user', 'project', 'milestone', 'time_entry', 'expense'];

/**
 * Admin-only audit log: newest entries first, filterable by entity type.
 * @param {object} props
 * @param {string} props.actorId
 */
function AuditLogTable({ actorId }) {
  const [entries, setEntries] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await fetchAuditLog(actorId, entityType));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actorId, entityType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          select
          size="small"
          label="Entity"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          sx={{ width: 200 }}
        >
          {ENTITY_TYPES.map((t) => <MenuItem key={t} value={t}>{t || 'All'}</MenuItem>)}
        </TextField>
        <Button onClick={load}>Refresh</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}
      {!loading && entries.length === 0 && <Typography>No audit entries.</Typography>}
      {!loading && entries.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {e.actor_name ? `${e.actor_name} (${e.actor_username})` : 'anonymous'}
                    {e.actor_role && <Chip size="small" label={e.actor_role} sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{e.action.replace('_', ' ')}</TableCell>
                  <TableCell>{e.entity_type}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 420, wordBreak: 'break-word' }}>
                    {e.changes ? JSON.stringify(e.changes) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}

AuditLogTable.propTypes = {
  actorId: PropTypes.string.isRequired,
};

export default AuditLogTable;
