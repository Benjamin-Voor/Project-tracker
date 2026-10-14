import PropTypes from 'prop-types';
import {
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

/**
 * Whether the user may edit/archive/allocate on this project.
 * @param {object} user
 * @param {object} project
 * @returns {boolean}
 */
export function canManageProject(user, project) {
  return user.role === 'admin' || (user.role === 'manager' && user.id === project.manager_id);
}

/**
 * Table of projects with role-aware row actions.
 * @param {object} props
 * @param {object[]} props.projects
 * @param {object} props.currentUser
 * @param {Function} props.onOpen
 * @param {Function} props.onEdit
 * @param {Function} props.onAllocations
 * @param {Function} props.onArchive
 * @param {Function} props.onRestore
 */
function ProjectTable({
  projects, currentUser, onOpen, onEdit, onAllocations, onArchive, onRestore,
}) {
  if (projects.length === 0) return <Typography>No projects to show.</Typography>;

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Manager</TableCell>
            <TableCell>Dates</TableCell>
            <TableCell align="right">Hours</TableCell>
            <TableCell align="right">Budget</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Team</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {projects.map((project) => {
            const manage = canManageProject(currentUser, project);
            return (
              <TableRow key={project.id} sx={project.is_archived ? { opacity: 0.6 } : undefined}>
                <TableCell>
                  {project.name}
                  {project.is_archived && <Chip size="small" label="archived" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{project.manager_name}</TableCell>
                <TableCell>{`${project.start_date} to ${project.end_date}`}</TableCell>
                <TableCell align="right">{project.allocated_hours}</TableCell>
                <TableCell align="right">
                  {project.budget == null ? '-' : Number(project.budget).toLocaleString()}
                </TableCell>
                <TableCell>{project.status.replace('_', ' ')}</TableCell>
                <TableCell align="right">{project.allocation_count}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" variant="outlined" onClick={() => onOpen(project)}>Open</Button>
                  <Button size="small" onClick={() => onAllocations(project)}>Team</Button>
                  {manage && !project.is_archived && (
                    <Button size="small" onClick={() => onEdit(project)}>Edit</Button>
                  )}
                  {manage && !project.is_archived && (
                    <Button size="small" onClick={() => onArchive(project)}>Archive</Button>
                  )}
                  {currentUser.role === 'admin' && project.is_archived && (
                    <Button size="small" onClick={() => onRestore(project)}>Restore</Button>
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

ProjectTable.propTypes = {
  projects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    manager_id: PropTypes.string,
    manager_name: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    allocated_hours: PropTypes.number,
    budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    status: PropTypes.string,
    is_archived: PropTypes.bool,
    allocation_count: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  })).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired,
  }).isRequired,
  onOpen: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onAllocations: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onRestore: PropTypes.func.isRequired,
};

export default ProjectTable;
