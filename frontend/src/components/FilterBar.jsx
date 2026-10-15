import PropTypes from 'prop-types';
import {
  Button, MenuItem, Stack, TextField, Typography,
} from '@mui/material';

/**
 * Case-insensitive check that any of the given values contains the search text.
 * @param {string} search - text typed by the user (blank matches everything)
 * @param {Array<string|null|undefined>} values - fields to search in
 * @returns {boolean}
 */
export function matchesSearch(search, values) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return values.some((v) => (v || '').toLowerCase().includes(needle));
}

/**
 * Search box plus a row of select filters, with a "Clear" button and a
 * "showing X of Y" count. Each filter's empty value ('') means "All".
 * @param {object} props
 * @param {string} props.search
 * @param {Function} props.onSearchChange - called with the new search text
 * @param {string} [props.searchLabel]
 * @param {object[]} [props.filters] - { key, label, value, options: [{ value, label }] }
 * @param {Function} [props.onFilterChange] - called with (key, value)
 * @param {Function} [props.onClear]
 * @param {number} [props.shown]
 * @param {number} [props.total]
 */
function FilterBar({
  search, onSearchChange, searchLabel = 'Search', filters = [], onFilterChange = () => {},
  onClear = undefined, shown = undefined, total = undefined,
}) {
  const active = search !== '' || filters.some((f) => f.value !== '');
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1}
      useFlexGap
      sx={{ flexWrap: 'wrap', alignItems: { xs: 'stretch', sm: 'center' }, mb: 2 }}
    >
      <TextField
        size="small"
        label={searchLabel}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ flex: { sm: '1 1 220px' }, maxWidth: { sm: 320 } }}
      />
      {filters.map((f) => (
        <TextField
          key={f.key}
          select
          size="small"
          label={f.label}
          value={f.value}
          onChange={(e) => onFilterChange(f.key, e.target.value)}
          sx={{ flex: { sm: '0 1 180px' }, minWidth: { sm: 140 } }}
        >
          <MenuItem value="">All</MenuItem>
          {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      ))}
      {active && onClear && <Button onClick={onClear}>Clear</Button>}
      {active && total !== undefined && (
        <Typography variant="body2" color="text.secondary">{`Showing ${shown} of ${total}`}</Typography>
      )}
    </Stack>
  );
}

FilterBar.propTypes = {
  search: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  searchLabel: PropTypes.string,
  filters: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    options: PropTypes.arrayOf(PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })).isRequired,
  })),
  onFilterChange: PropTypes.func,
  onClear: PropTypes.func,
  shown: PropTypes.number,
  total: PropTypes.number,
};

export default FilterBar;
