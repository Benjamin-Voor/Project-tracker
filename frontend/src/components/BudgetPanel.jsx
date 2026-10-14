import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { addExpense, fetchBudget, fetchExpenses } from '../services/projects';

const money = (value) => (value == null ? '-' : Number(value).toLocaleString(undefined, {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}));

/**
 * One labelled figure in the budget summary.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {string} [props.hint]
 * @param {string} [props.color]
 */
function Figure({
  label, value, hint, color,
}) {
  return (
    <Paper sx={{ p: 2, height: '100%', boxSizing: 'border-box' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" color={color}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{hint}</Typography>}
    </Paper>
  );
}

Figure.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  hint: PropTypes.string,
  color: PropTypes.string,
};

Figure.defaultProps = {
  hint: '',
  color: undefined,
};

/**
 * Budget summary and expenses for one project (manager/admin only).
 * Salary cost = logged hours x salary / 2080; actual cost = salary cost + expenses.
 * @param {object} props
 * @param {object} props.project
 * @param {string} props.actorId
 * @param {Function} props.onEditBudget - opens the project form to adjust the budget
 */
function BudgetPanel({ project, actorId, onEditBudget }) {
  const [budget, setBudget] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ amount: '', description: '', incurred_on: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, e] = await Promise.all([fetchBudget(actorId, project.id), fetchExpenses(actorId, project.id)]);
      setBudget(b);
      setExpenses(e);
    } catch (err) {
      setError(err.message);
    }
  }, [actorId, project.id]);

  useEffect(() => {
    load();
  }, [load, project.budget]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      await addExpense(actorId, project.id, form);
      setForm({ amount: '', description: '', incurred_on: '' });
      load();
    } catch (err) {
      setFieldErrors(err.fields || {});
      setError(err.message);
    }
  };

  const set = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));
  const spentPct = budget?.budget ? Math.min(100, (Number(budget.actual_cost) / Number(budget.budget)) * 100) : 0;
  const over = budget?.variance != null && Number(budget.variance) < 0;

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {budget && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
              gap: 2,
              mb: 2,
            }}
          >
            <Box>
              <Figure label="Budget" value={money(budget.budget)} hint={budget.budget == null ? 'Not set' : ''} />
            </Box>
            <Box>
              <Figure label="Salary cost" value={money(budget.salary_cost)} hint={`${Number(budget.logged_hours)} h logged`} />
            </Box>
            <Box>
              <Figure label="Expenses" value={money(budget.expense_cost)} />
            </Box>
            <Box>
              <Figure
                label={over ? 'Over budget' : 'Remaining'}
                value={money(budget.variance == null ? null : Math.abs(Number(budget.variance)))}
                color={over ? 'error' : 'success.main'}
              />
            </Box>
            <Box sx={{ gridColumn: { xs: 'span 2', md: 'auto' } }}>
              <Figure
                label="Planned salary cost"
                value={money(budget.planned_salary_cost)}
                hint="From team planned hours"
              />
            </Box>
          </Box>
          {budget.budget != null && (
            <LinearProgress
              variant="determinate"
              value={spentPct}
              color={over ? 'error' : 'primary'}
              sx={{ height: 8, borderRadius: 4, mb: 1 }}
            />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {`Actual cost ${money(budget.actual_cost)} = logged hours × salary ÷ 2080 + expenses.`}
            {!project.is_archived && <Button size="small" onClick={onEditBudget} sx={{ ml: 1 }}>Adjust budget</Button>}
          </Typography>
        </>
      )}
      {!project.is_archived && (
        <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Add expense</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Amount"
              value={form.amount}
              onChange={set('amount')}
              required
              error={Boolean(fieldErrors.amount)}
              helperText={fieldErrors.amount}
              slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              sx={{ width: { sm: 140 } }}
            />
            <TextField
              size="small"
              label="Description"
              value={form.description}
              onChange={set('description')}
              required
              error={Boolean(fieldErrors.description)}
              helperText={fieldErrors.description}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="date"
              label="Date"
              value={form.incurred_on}
              onChange={set('incurred_on')}
              required
              error={Boolean(fieldErrors.incurred_on)}
              helperText={fieldErrors.incurred_on}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button type="submit" variant="contained">Add</Button>
          </Stack>
        </Paper>
      )}
      {expenses.length === 0 ? <Typography>No expenses recorded.</Typography> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Added by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.incurred_on}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell align="right">{Number(e.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</TableCell>
                  <TableCell>{e.created_by_name || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}

BudgetPanel.propTypes = {
  project: PropTypes.shape({
    id: PropTypes.string.isRequired,
    budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    is_archived: PropTypes.bool,
  }).isRequired,
  actorId: PropTypes.string.isRequired,
  onEditBudget: PropTypes.func.isRequired,
};

export default BudgetPanel;
