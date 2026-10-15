import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Box, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import Gantt from 'frappe-gantt';
import './MilestoneGantt.css';
import { scrollX } from './responsive';
import { updateMilestone } from '../services/projects';

const PROGRESS = { not_started: 0, in_progress: 50, completed: 100 };
const VIEW_MODES = ['Day', 'Week', 'Month'];
// Pixels below the last row so its popup is not cut off.
const POPUP_ROOM = 90;

/**
 * Escape text for the chart's HTML popup.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Format a Date as YYYY-MM-DD in local time.
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Microsoft Project style Gantt chart of a project's milestones, with arrows
 * from each milestone to the ones that depend on it. Managers and admins can
 * drag or resize a bar to change the planned dates.
 * @param {object} props
 * @param {object} props.project
 * @param {object[]} props.milestones
 * @param {string} props.actorId
 * @param {boolean} props.editable
 * @param {Function} props.onChange - called with the updated milestone list
 */
function MilestoneGantt({
  project, milestones, actorId, editable, onChange,
}) {
  const container = useRef(null);
  const [viewMode, setViewMode] = useState('Week');
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);

  useEffect(() => {
    const el = container.current;
    if (!el || milestones.length === 0) return undefined;
    const byId = Object.fromEntries(milestones.map((m) => [m.id, m]));
    const tasks = [...milestones]
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((m) => ({
        id: m.id,
        name: `#${m.sequence_number} ${m.name}`,
        start: m.start_date,
        end: m.end_date,
        progress: PROGRESS[m.status] ?? 0,
        custom_class: `ms-${m.status}`,
        // Arrows from each milestone this one depends on.
        dependencies: (m.depends_on || []).filter((id) => byId[id]).join(','),
      }));

    // frappe-gantt reports date changes while the bar is still moving. Saving
    // each one re-renders the chart mid-drag, so keep the latest dates per
    // milestone and save them once the mouse is released.
    const pending = new Map();
    const onDateChange = (task, start, end) => {
      pending.set(task.id, { start_date: toIsoDate(start), end_date: toIsoDate(end) });
    };
    const save = async () => {
      if (pending.size === 0) return;
      const changes = [...pending];
      pending.clear();
      setError('');
      try {
        let updated = null;
        for (const [id, dates] of changes) {
          updated = await updateMilestone(actorId, project.id, id, dates);
        }
        onChange(updated);
      } catch (err) {
        const { start_date: startError, end_date: endError } = err.fields || {};
        setError([startError && `Start ${startError}`, endError && `End ${endError}`]
          .filter(Boolean).join('. ') || err.message);
        setReset((n) => n + 1);
      }
    };
    // Defer so frappe-gantt's own mouseup handler records the final dates first.
    const onMouseUp = () => setTimeout(save, 0);
    document.addEventListener('mouseup', onMouseUp);

    new Gantt(el, tasks, {
      view_mode: viewMode,
      view_mode_select: false,
      readonly: !editable,
      readonly_progress: true,
      on_date_change: onDateChange,
      popup: ({ task, set_title: setTitle, set_subtitle: setSubtitle, set_details: setDetails }) => {
        const m = byId[task.id];
        const actual = m.actual_start_date
          ? `<br>Actual: ${escapeHtml(m.actual_start_date)} to ${escapeHtml(m.actual_end_date || '…')}`
          : '';
        const people = m.assignees.map((a) => `${a.first_name} ${a.last_name}`).join(', ');
        const deps = (m.depends_on || []).filter((id) => byId[id])
          .map((id) => `#${byId[id].sequence_number} ${byId[id].name}`).join(', ');
        setTitle(escapeHtml(task.name));
        setSubtitle(`${escapeHtml(m.start_date)} to ${escapeHtml(m.end_date)} · ${m.status.replace('_', ' ')}`);
        setDetails(`Assignees: ${escapeHtml(people || 'none')}${actual}`
          + `${deps ? `<br>Depends on: ${escapeHtml(deps)}` : ''}`);
      },
    });
    // frappe-gantt's fixed height leaves no room for the horizontal scrollbar
    // or for the popup under the last row, which then sit behind a vertical
    // scrollbar. Make room for both.
    const chart = el.querySelector('.gantt-container');
    if (chart) {
      const scrollbar = chart.offsetHeight - chart.clientHeight;
      chart.style.height = `${chart.scrollHeight + scrollbar + POPUP_ROOM}px`;
    }
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      el.innerHTML = '';
    };
  }, [milestones, editable, viewMode, actorId, project.id, onChange, reset]);

  if (milestones.length === 0) return <Typography>No milestones yet.</Typography>;

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {editable ? 'Drag a bar to move it, or drag its ends to change the dates.' : ''}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, value) => value && setViewMode(value)}
        >
          {VIEW_MODES.map((mode) => <ToggleButton key={mode} value={mode}>{mode}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Box
        ref={container}
        sx={{
          ...scrollX,
          // Microsoft Project palette: blue task bars, green once completed.
          '& .bar-wrapper .bar': { fill: '#8fb4e3' },
          '& .bar-wrapper .bar-progress': { fill: '#2b579a' },
          '& .bar-wrapper.ms-completed .bar, & .bar-wrapper.ms-completed .bar-progress': { fill: '#217346' },
          '& .bar-wrapper.ms-completed .bar-label': { fill: '#fff' },
        }}
      />
    </>
  );
}

MilestoneGantt.propTypes = {
  project: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  milestones: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    sequence_number: PropTypes.number,
    name: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    actual_start_date: PropTypes.string,
    actual_end_date: PropTypes.string,
    status: PropTypes.string,
    assignees: PropTypes.arrayOf(PropTypes.object),
    depends_on: PropTypes.arrayOf(PropTypes.string),
  })).isRequired,
  actorId: PropTypes.string.isRequired,
  editable: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default MilestoneGantt;
