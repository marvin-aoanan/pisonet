import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Typography,
  Alert,
  Button,
  TextField,
  Divider,
  Snackbar,
  useMediaQuery,
  useTheme
} from '@mui/material';

const API_URL = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5001/api`;

function AdminCoinsOut({ adminPassword }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [coinsOutLoading, setCoinsOutLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState('');
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportActionLoading, setReportActionLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const actionButtonSx = {
    minWidth: 210,
    width: isMobile ? '100%' : 'auto'
  };

  useEffect(() => {
    if (!adminPassword) return;

    const loadData = async () => {
      setBackupsLoading(true);
      setReportsLoading(true);
      try {
        const [backupResponse, reportResponse] = await Promise.all([
          axios.get(`${API_URL}/settings/admin/backups`, {
            headers: { 'x-admin-password': adminPassword }
          }),
          axios.get(`${API_URL}/settings/admin/final-reports`, {
            headers: { 'x-admin-password': adminPassword }
          })
        ]);

        const nextBackups = backupResponse?.data?.backups || [];
        setBackups(nextBackups);
        setSelectedBackup((prev) => {
          if (!prev && nextBackups.length > 0) return nextBackups[0].file;
          if (prev && !nextBackups.some((item) => item.file === prev)) return nextBackups[0]?.file || '';
          return prev;
        });

        const nextReports = reportResponse?.data?.reports || [];
        setReports(nextReports);
        setSelectedReport((prev) => {
          if (!prev && nextReports.length > 0) return nextReports[0].file;
          if (prev && !nextReports.some((item) => item.file === prev)) return nextReports[0]?.file || '';
          return prev;
        });
      } catch (err) {
        console.error('Error loading Coins Out data:', err);
        setMessage({ type: 'error', text: 'Failed to load Coins Out data' });
      } finally {
        setBackupsLoading(false);
        setReportsLoading(false);
      }
    };

    loadData();
  }, [adminPassword]);

  const fetchBackups = async () => {
    if (!adminPassword) return;

    setBackupsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/settings/admin/backups`, {
        headers: { 'x-admin-password': adminPassword }
      });

      const nextBackups = response?.data?.backups || [];
      setBackups(nextBackups);
      if (!selectedBackup && nextBackups.length > 0) {
        setSelectedBackup(nextBackups[0].file);
      }
      if (selectedBackup && !nextBackups.some((item) => item.file === selectedBackup)) {
        setSelectedBackup(nextBackups[0]?.file || '');
      }
    } catch (err) {
      console.error('Error loading backup list:', err);
      setMessage({ type: 'error', text: 'Failed to load backup list' });
    } finally {
      setBackupsLoading(false);
    }
  };

  const fetchFinalReports = async () => {
    if (!adminPassword) return;

    setReportsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/settings/admin/final-reports`, {
        headers: { 'x-admin-password': adminPassword }
      });

      const nextReports = response?.data?.reports || [];
      setReports(nextReports);

      if (!selectedReport && nextReports.length > 0) {
        setSelectedReport(nextReports[0].file);
      }
      if (selectedReport && !nextReports.some((item) => item.file === selectedReport)) {
        setSelectedReport(nextReports[0]?.file || '');
      }
    } catch (err) {
      console.error('Error loading final report list:', err);
      setMessage({ type: 'error', text: 'Failed to load final report list' });
    } finally {
      setReportsLoading(false);
    }
  };

  const handleCoinsOut = async () => {
    const confirmed = window.confirm(
      'Run Coins Out now? This will generate a final report, create a DB backup, and clear transactions/sessions for a new cycle.'
    );

    if (!confirmed) {
      return;
    }

    setCoinsOutLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/settings/admin/coins-out`,
        {},
        { headers: { 'x-admin-password': adminPassword } }
      );

      const backupFile = response?.data?.files?.backup_file || 'backup file';
      const reportFile = response?.data?.files?.report_file || 'report file';
      setMessage({
        type: 'success',
        text: `Coins Out completed. Generated ${reportFile} and ${backupFile}.`
      });
      await Promise.all([fetchBackups(), fetchFinalReports()]);
      if (response?.data?.files?.report_file) {
        setSelectedReport(response.data.files.report_file);
      }
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to complete Coins Out';
      console.error('Error running Coins Out:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setCoinsOutLoading(false);
    }
  };

  const handleViewFinalReportHtml = async () => {
    if (!selectedReport) {
      setMessage({ type: 'error', text: 'Please select a final report file first.' });
      return;
    }

    setReportActionLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/settings/admin/final-reports/${encodeURIComponent(selectedReport)}/html`,
        {
          headers: { 'x-admin-password': adminPassword },
          responseType: 'blob'
        }
      );

      const htmlBlob = new Blob([response.data], { type: 'text/html' });
      const htmlUrl = window.URL.createObjectURL(htmlBlob);
      window.open(htmlUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => window.URL.revokeObjectURL(htmlUrl), 60_000);
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to load HTML report view';
      console.error('Error opening HTML report:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setReportActionLoading(false);
    }
  };

  const handleDownloadFinalReportPdf = async () => {
    if (!selectedReport) {
      setMessage({ type: 'error', text: 'Please select a final report file first.' });
      return;
    }

    setReportActionLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/settings/admin/final-reports/${encodeURIComponent(selectedReport)}/pdf`,
        {
          headers: { 'x-admin-password': adminPassword },
          responseType: 'blob'
        }
      );

      const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
      const pdfUrl = window.URL.createObjectURL(pdfBlob);
      const pdfName = selectedReport.replace(/\.json$/i, '.pdf');
      const anchor = document.createElement('a');
      anchor.href = pdfUrl;
      anchor.download = pdfName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to download PDF report';
      console.error('Error downloading PDF report:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setReportActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) {
      setMessage({ type: 'error', text: 'Please select a backup file to restore' });
      return;
    }

    const confirmed = window.confirm(
      `Restore backup ${selectedBackup}? A pre-restore snapshot will be created automatically.`
    );
    if (!confirmed) return;

    setRestoreLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/settings/admin/restore-backup`,
        { backup_file: selectedBackup },
        { headers: { 'x-admin-password': adminPassword } }
      );

      const preRestore = response?.data?.pre_restore_backup_file || 'pre-restore backup';
      const skippedSnapshot = response?.data?.skipped_pre_restore_snapshot;
      setMessage({
        type: 'success',
        text: skippedSnapshot
          ? 'Backup restored successfully. No new safety snapshot was created for pre-restore backup.'
          : `Backup restored successfully. Safety snapshot created: ${preRestore}.`
      });

      await fetchBackups();
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to restore backup';
      console.error('Error restoring backup:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestorePreviousState = async () => {
    const previousStateBackup = backups.find((backup) => backup.file.startsWith('pre-restore-'));

    if (!previousStateBackup) {
      setMessage({ type: 'error', text: 'No previous-state backup was found.' });
      return;
    }

    const confirmed = window.confirm(
      `Restore previous state using ${previousStateBackup.file}?`
    );
    if (!confirmed) return;

    setRestoreLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/settings/admin/restore-backup`,
        { backup_file: previousStateBackup.file },
        { headers: { 'x-admin-password': adminPassword } }
      );

      const preRestore = response?.data?.pre_restore_backup_file || 'pre-restore backup';
      const skippedSnapshot = response?.data?.skipped_pre_restore_snapshot;
      setMessage({
        type: 'success',
        text: skippedSnapshot
          ? 'Previous state restored successfully. No new safety snapshot was created.'
          : `Previous state restored successfully. Safety snapshot created: ${preRestore}.`
      });

      await fetchBackups();
    } catch (err) {
      const errorText = err?.response?.data?.error || 'Failed to restore previous state';
      console.error('Error restoring previous state:', err);
      setMessage({ type: 'error', text: errorText });
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <Box maxWidth="lg">
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Coins Out
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Coins Out will generate a final report, create a DB backup, then clear transactions and sessions. Make sure no active sessions are running before proceeding. Always verify the generated final report and backup files after Coins Out completes.
          </Alert>
          <Button
            variant="contained"
            color="error"
            onClick={handleCoinsOut}
            disabled={coinsOutLoading}
            sx={actionButtonSx}
          >
            {coinsOutLoading ? 'Processing Coins Out...' : 'Run Coins Out'}
          </Button>
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Final Reports
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              select
              fullWidth
              label="Report File"
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
              SelectProps={{ native: true }}
              disabled={reportsLoading || reportActionLoading || reports.length === 0}
              helperText={reports.length === 0 ? 'No final reports generated yet.' : `${reports.length} final report file(s) available.`}
            >
              {reports.length === 0 ? (
                <option value="">No final reports available</option>
              ) : (
                reports.map((report) => (
                  <option key={report.file} value={report.file}>
                    {report.file}
                  </option>
                ))
              )}
            </TextField>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Button
                variant="outlined"
                onClick={fetchFinalReports}
                disabled={reportsLoading || reportActionLoading}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                {reportsLoading ? 'Refreshing...' : 'Refresh Final Reports'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleViewFinalReportHtml}
                disabled={reportActionLoading || reportsLoading || !selectedReport}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                {reportActionLoading ? 'Opening...' : 'View Report (HTML)'}
              </Button>
              <Button
                variant="contained"
                onClick={handleDownloadFinalReportPdf}
                disabled={reportActionLoading || reportsLoading || !selectedReport}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                {reportActionLoading ? 'Opening...' : 'Save as PDF (HTML Layout)'}
              </Button>
            </Box>
          </Box>
        </Box>

        <Divider />

        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Restore Backup
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              select
              fullWidth
              label="Backup File"
              value={selectedBackup}
              onChange={(e) => setSelectedBackup(e.target.value)}
              SelectProps={{ native: true }}
              disabled={backupsLoading || restoreLoading || backups.length === 0}
              helperText={backups.length === 0 ? 'No backup files found yet.' : `${backups.length} backup file(s) available.`}
            >
              {backups.length === 0 ? (
                <option value="">No backups available</option>
              ) : (
                backups.map((backup) => (
                  <option key={backup.file} value={backup.file}>
                    {backup.file}
                  </option>
                ))
              )}
            </TextField>

            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <Button
                variant="outlined"
                onClick={fetchBackups}
                disabled={backupsLoading || restoreLoading}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                {backupsLoading ? 'Refreshing...' : 'Refresh Backup List'}
              </Button>
              <Button
                variant="contained"
                color="warning"
                onClick={handleRestoreBackup}
                disabled={restoreLoading || backupsLoading || !selectedBackup}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                {restoreLoading ? 'Restoring...' : 'Restore Selected Backup'}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={handleRestorePreviousState}
                disabled={restoreLoading || backupsLoading || !backups.some((backup) => backup.file.startsWith('pre-restore-'))}
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                Restore Previous State
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={!!message.text}
        autoHideDuration={6000}
        onClose={() => setMessage({ type: '', text: '' })}
      >
        <Alert severity={message.type || 'info'} onClose={() => setMessage({ type: '', text: '' })}>
          {message.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default AdminCoinsOut;
