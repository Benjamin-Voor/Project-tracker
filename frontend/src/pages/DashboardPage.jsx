import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { hideOnXs, scrollX } from '../components/responsive';
import { useAuth } from '../context/AuthContext';
import { fetchProjects, fetchWorkload } from '../services/projects';

/**
 * Flagged projects (late or at risk) with the reasons.
 * @param {object} props
 * @param {object[]} props.projects - the flagged projects
 * @param {string} props.emptyText - shown when the list is empty
 */
function RiskTable({ projects, emptyText }) {
  if (projects.length === 0) return <Typography>{emptyText}</Typography>;
  return (
    <TableContainer component={Paper} sx={scrollX}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Project</TableCell>
            <TableCell sx={hideOnXs}>Manager</TableCell>
            <TableCell sx={hideOnXs}>End date</TableCell>
            <TableCell>Why</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>{project.name}</TableCell>
              <TableCell sx={hideOnXs}>{project.manager_name}</TableCell>
              <TableCell sx={hideOnXs}>{project.end_date}</TableCell>
              <TableCell>{project.risk_reasons.join('; ')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

RiskTable.propTypes = {
  emptyText: PropTypes.string.isRequired,
  projects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    manager_name: PropTypes.string,
    end_date: PropTypes.string,
    risk_reasons: PropTypes.arrayOf(PropTypes.string).isRequired,
  })).isRequired,
};

/**
 * Employees' allocated hours across active projects against their capacity.
 * @param {object} props
 * @param {object[]} props.workload - rows from the workload report
 */
function WorkloadTable({ workload }) {
  if (workload.length === 0) return <Typography>No employees to show.</Typography>;
  return (
    <TableContainer component={Paper} sx={scrollX}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Employee</TableCell>
            <TableCell sx={hideOnXs}>Projects</TableCell>
            <TableCell align="right">Allocated / capacity (h)</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {workload.map((row) => (
            <TableRow key={row.user_id}>
              <TableCell>{row.name}</TableCell>
              <TableCell sx={hideOnXs}>
                {row.projects.map((p) => `${p.name} (${p.allocated_hours} h)`).join(', ') || '-'}
              </TableCell>
              <TableCell align="right">{`${row.allocated_hours} / ${row.capacity_hours}`}</TableCell>
              <TableCell>
                {row.over_allocated && <Chip size="small" color="error" label="over-allocated" />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

WorkloadTable.propTypes = {
  workload: PropTypes.arrayOf(PropTypes.shape({
    user_id: PropTypes.string.isRequired,
    name: PropTypes.string,
    allocated_hours: PropTypes.number,
    capacity_hours: PropTypes.number,
    over_allocated: PropTypes.bool,
    projects: PropTypes.arrayOf(PropTypes.shape({
      name: PropTypes.string,
      allocated_hours: PropTypes.number,
    })).isRequired,
  })).isRequired,
};

/**
 * Dashboard for managers and admins: projects at risk of missing their deadline
 * and employees allocated more hours than they can work.
 */
function DashboardPage() {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  // False until the first load succeeds, so empty "(0)" sections don't flash while loading.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const actorId = currentUser?.id;

  const load = useCallback(async () => {
    if (!actorId) return;
    setLoading(true);
    setError('');
    try {
      const [projectList, workloadList] = await Promise.all([
        fetchProjects(actorId), fetchWorkload(actorId),
      ]);
      setProjects(projectList);
      setWorkload(workloadList);
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    load();
  }, [load]);

  const late = projects.filter((p) => p.is_late);
  const atRisk = projects.filter((p) => p.at_risk);
  const overAllocated = workload.filter((w) => w.over_allocated);

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' }, mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Dashboard</Typography>
        <Button onClick={load} disabled={loading}>Refresh</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ mb: 2 }}><CircularProgress size={24} /></Box>}

      {loaded && (
        <>
          <Typography variant="h6">{`Late projects (${late.length})`}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Active projects past their end date: the deadline is already missed.
          </Typography>
          <RiskTable projects={late} emptyText="No projects are late." />

          <Typography variant="h6" sx={{ mt: 4 }}>{`At-risk projects (${atRisk.length})`}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Deadline still ahead, but at least 75% of the time has passed with fewer than
            75% of milestones completed, or a milestone is past its planned end date.
          </Typography>
          <RiskTable projects={atRisk} emptyText="No projects are at risk." />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' }, mt: 4 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {`Over-allocated employees (${overAllocated.length})`}
            </Typography>
            <Button size="small" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show over-allocated only' : 'Show all employees'}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Allocated hours across active projects compared with capacity: 8 hours per
            working day (Monday to Friday) over the dates of those projects.
          </Typography>
          <WorkloadTable workload={showAll ? workload : overAllocated} />
        </>
      )}
    </Container>
  );
}

export default DashboardPage;
