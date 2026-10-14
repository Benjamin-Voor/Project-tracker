import { useState } from 'react';
import {
  Alert, Box, Button, Container, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

/**
 * Username + password login form.
 */
function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ py: 10 }}>
      <Paper component="form" onSubmit={handleSubmit} sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h5" component="h1">Project Tracker</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            autoComplete="username"
            slotProps={{ htmlInput: { maxLength: 6 } }}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Box>
            <Button type="submit" variant="contained" disabled={submitting} fullWidth>
              Log in
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

export default LoginPage;
