import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Alert, type AlertColor, Snackbar } from '@mui/material';

interface ExportToastContextValue {
  showToast: (message: string, severity?: AlertColor) => void;
}

const ExportToastContext = createContext<ExportToastContextValue | null>(null);

const AUTO_HIDE_MS = 6000;

export function ExportToastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('info');

  const showToast = useCallback((msg: string, sev: AlertColor = 'info') => {
    // Close any existing toast first so the new one triggers fresh
    setOpen(false);
    // Use microtask to ensure state flush before re-opening
    queueMicrotask(() => {
      setMessage(msg);
      setSeverity(sev);
      setOpen(true);
    });
  }, []);

  const handleClose = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  return (
    <ExportToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={AUTO_HIDE_MS}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleClose}
          severity={severity}
          variant="filled"
          sx={{ width: '100%', maxWidth: 560 }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ExportToastContext.Provider>
  );
}

export function useExportToast(): ExportToastContextValue {
  const ctx = useContext(ExportToastContext);
  if (!ctx) {
    throw new Error('useExportToast must be used within an ExportToastProvider');
  }
  return ctx;
}
