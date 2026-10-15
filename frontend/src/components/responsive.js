/**
 * Shared responsive helpers so every table and dialog follows the same pattern:
 * tables scroll horizontally inside their TableContainer and hide less important
 * columns on narrow screens; dialogs go full screen on phones.
 * Uses MUI breakpoints (xs < 600px <= sm < 900px <= md).
 */
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/** sx for a table cell hidden on phones (below sm). Put it on the header and body cell. */
export const hideOnXs = { display: { xs: 'none', sm: 'table-cell' } };

/** sx for a table cell hidden on phones and small tablets (below md). */
export const hideBelowMd = { display: { xs: 'none', md: 'table-cell' } };

/** sx for a TableContainer: scroll sideways instead of widening the page. */
export const scrollX = { overflowX: 'auto', maxWidth: '100%' };

/**
 * Whether the screen is phone-sized (below the sm breakpoint).
 * Use as `<Dialog fullScreen={useIsPhone()} ...>`.
 * @returns {boolean}
 */
export function useIsPhone() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}
