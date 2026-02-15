window.addEventListener('DOMContentLoaded', async () => {
  // ============ AUTHENTICATION ============
  let isAuthenticated = false;
  const loginScreen = document.getElementById('login-screen');
  const mainApp = document.getElementById('main-app');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');

  if (!loginForm) {
    console.error('Login form not found!');
    return;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    
    try {
      const valid = await window.electronAPI.verifyPassword(password);
      if (valid) {
        isAuthenticated = true;
        loginScreen.style.display = 'none';
        mainApp.style.display = 'block';
        initializeApp();
      } else {
        loginError.textContent = 'Incorrect password!';
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (error) {
      console.error('Login error:', error);
      loginError.textContent = 'Login failed. Please try again.';
    }
  });

  // Logout button handler
  document.getElementById('logout-btn').addEventListener('click', () => {
    isAuthenticated = false;
    mainApp.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
    loginError.textContent = '';
    
    // Disconnect websocket if connected
    if (ws) {
      ws.close();
      ws = null;
    }
  });

  // ============ MAIN APP INITIALIZATION ============
  let ws = null; // WebSocket connection (shared across logout)
  
  function initializeApp() {
  const unitsContainer = document.getElementById('units-container');
  const NUM_UNITS = 10; // simulate 10 units
  const UNIT_COINS = [1, 5, 10]; // coin options

  const units = [];
  
  // ============ NETWORK SYNC ============
  let syncEnabled = false;
  let syncServer = 'localhost:8080';
  let syncWsPort = '8081';

  function connectWebSocket() {
    if (!syncEnabled) return;
    
    try {
      const wsUrl = `ws://${syncServer.split(':')[0]}:${syncWsPort}`;
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('Connected to sync server');
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
          statusEl.textContent = 'Connected';
          statusEl.classList.add('connected');
        }
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleSyncMessage(message);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('Disconnected from sync server');
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
          statusEl.textContent = 'Disconnected';
          statusEl.classList.remove('connected');
        }
        
        // Reconnect after 5 seconds
        if (syncEnabled) {
          setTimeout(connectWebSocket, 5000);
        }
      };
    } catch (error) {
      console.error('Failed to connect to sync server:', error);
    }
  }

  function handleSyncMessage(message) {
    if (message.type === 'initial_state') {
      // Load initial state from server
      message.data.forEach(saved => {
        const unit = units.find(u => u.id === saved.unit_id);
        if (unit && saved.remaining_seconds > 0) {
          unit.totalSeconds = saved.remaining_seconds;
          unit.revenue = saved.total_revenue;
          unit.timerEl.textContent = formatTime(unit.totalSeconds);
          unit.revenueEl.textContent = `Revenue: ₱${unit.revenue}`;
          startTimer(unit);
        }
      });
    } else if (message.type === 'timer_update') {
      // Update from another client
      const { unit_id, remaining_seconds, total_revenue } = message.data;
      const unit = units.find(u => u.id === unit_id);
      if (unit) {
        unit.totalSeconds = remaining_seconds;
        unit.revenue = total_revenue;
        unit.timerEl.textContent = formatTime(unit.totalSeconds);
        unit.revenueEl.textContent = `Revenue: ₱${unit.revenue}`;
        if (remaining_seconds > 0 && !unit.intervalId) {
          startTimer(unit);
        }
      }
    } else if (message.type === 'coin_insert') {
      // Coin inserted from another client
      const { unit_id, coin_value } = message.data;
      const unit = units.find(u => u.id === unit_id);
      if (unit) {
        unit.totalSeconds += coin_value * 60;
        unit.revenue += coin_value;
        unit.timerEl.textContent = formatTime(unit.totalSeconds);
        unit.revenueEl.textContent = `Revenue: ₱${unit.revenue}`;
        if (!unit.intervalId) {
          startTimer(unit);
        }
      }
    }
  }

  async function syncToServer(unitId, remainingSeconds, totalRevenue) {
    if (!syncEnabled) return;
    
    try {
      const response = await fetch(`http://${syncServer}/api/timer/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          remaining_seconds: remainingSeconds,
          total_revenue: totalRevenue
        })
      });
    } catch (error) {
      console.error('Failed to sync to server:', error);
    }
  }

  async function syncCoinInsert(unitId, coinValue) {
    if (!syncEnabled) return;
    
    try {
      const response = await fetch(`http://${syncServer}/api/coin/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_id: unitId,
          coin_value: coinValue
        })
      });
    } catch (error) {
      console.error('Failed to sync coin insert:', error);
    }
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Initialize unit panels
  for (let i = 1; i <= NUM_UNITS; i++) {
    const panel = document.createElement('div');
    panel.classList.add('unit-panel');
    panel.innerHTML = `
      <h2>PC ${i}</h2>
      <div id="timer${i}" class="timer">00:00</div>
      <div id="revenue${i}" class="revenue">Revenue: ₱0</div>
    `;

    // Add coin buttons
    UNIT_COINS.forEach(c => {
      const btn = document.createElement('button');
      btn.classList.add('coin-btn', `coin${c}`);
      btn.textContent = `Insert ₱${c}`;
      btn.addEventListener('click', () => addTime(i, c));
      panel.appendChild(btn);
    });

    unitsContainer.appendChild(panel);

    units.push({
      id: i,
      totalSeconds: 0,
      revenue: 0,
      intervalId: null,
      timerEl: panel.querySelector(`#timer${i}`),
      revenueEl: panel.querySelector(`#revenue${i}`)
    });
  }

  function startTimer(unit) {
    if (unit.intervalId) clearInterval(unit.intervalId);
    unit.intervalId = setInterval(() => {
      if (unit.totalSeconds <= 0) {
        clearInterval(unit.intervalId);
        unit.timerEl.textContent = "00:00";
        saveTimer(unit); // Save when timer reaches 0
        return;
      }
      unit.totalSeconds--;
      unit.timerEl.textContent = formatTime(unit.totalSeconds);
      
      // Save every 5 seconds to reduce writes
      if (unit.totalSeconds % 5 === 0) {
        saveTimer(unit);
      }
    }, 1000);
  }

  function saveTimer(unit) {
    if (window.electronAPI && window.electronAPI.updateTimer) {
      window.electronAPI.updateTimer(unit.id, unit.totalSeconds, unit.revenue);
    }
    // Sync to network server
    syncToServer(unit.id, unit.totalSeconds, unit.revenue);
  }

  function addTime(unitId, minutes) {
    const unit = units.find(u => u.id === unitId);
    unit.totalSeconds += minutes * 60;
    unit.revenue += minutes;
    unit.timerEl.textContent = formatTime(unit.totalSeconds);
    unit.revenueEl.textContent = `Revenue: ₱${unit.revenue}`;
    startTimer(unit);

    // Save immediately when coin is inserted
    saveTimer(unit);

    // IPC call to log coin
    if (window.electronAPI && window.electronAPI.simulateCoin) {
      window.electronAPI.simulateCoin(unitId, minutes);
    }
    
    // Sync coin insert to network
    syncCoinInsert(unitId, minutes);
  }

  // Load saved timers on startup
  async function loadSavedTimers() {
    if (window.electronAPI && window.electronAPI.getTimers) {
      try {
        const savedTimers = await window.electronAPI.getTimers();
        savedTimers.forEach(saved => {
          const unit = units.find(u => u.id === saved.unit_id);
          if (unit && saved.remaining_seconds > 0) {
            unit.totalSeconds = saved.remaining_seconds;
            unit.revenue = saved.total_revenue;
            unit.timerEl.textContent = formatTime(unit.totalSeconds);
            unit.revenueEl.textContent = `Revenue: ₱${unit.revenue}`;
            startTimer(unit);
          }
        });
      } catch (error) {
        console.error('Failed to load saved timers:', error);
      }
    }
  }

  // Load timers after UI is ready
  loadSavedTimers();

  // ============ NAVIGATION ============
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view-container');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewName = btn.dataset.view;
      
      // Update active nav button
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show selected view
      views.forEach(v => v.classList.remove('active'));
      document.getElementById(`${viewName}-view`).classList.add('active');
      
      // Load data for the view
      if (viewName === 'dashboard') {
        loadDashboard();
      } else if (viewName === 'reports') {
        loadReports();
      }
    });
  });

  // ============ DASHBOARD ============
  async function loadDashboard() {
    try {
      // Load total revenue today
      const revenueToday = await window.electronAPI.getRevenueToday();
      document.getElementById('total-revenue-today').textContent = `₱${revenueToday}`;
      
      // Load total revenue all time
      const revenueAll = await window.electronAPI.getRevenueAll();
      document.getElementById('total-revenue-all').textContent = `₱${revenueAll}`;
      
      // Load sessions today
      const sessionsToday = await window.electronAPI.getSessionsToday();
      document.getElementById('sessions-today').textContent = sessionsToday;
      
      // Calculate active units
      const activeCount = units.filter(u => u.totalSeconds > 0).length;
      document.getElementById('active-units').textContent = `${activeCount}/${NUM_UNITS}`;
      
      // Load per-unit stats
      const unitStats = await window.electronAPI.getUnitStats();
      const statsBody = document.getElementById('unit-stats-body');
      statsBody.innerHTML = '';
      
      for (let i = 1; i <= NUM_UNITS; i++) {
        const stat = unitStats.find(s => s.unit_id === i) || { today: 0, all_time: 0 };
        const unit = units.find(u => u.id === i);
        const status = unit && unit.totalSeconds > 0 ? 'Active' : 'Idle';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>PC ${i}</td>
          <td>₱${stat.today}</td>
          <td>₱${stat.all_time}</td>
          <td style="color: ${status === 'Active' ? '#0f0' : '#555'}">${status}</td>
        `;
        statsBody.appendChild(row);
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }

  // ============ REPORTS ============
  async function loadReports() {
    // Set default date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    document.getElementById('date-to').valueAsDate = today;
    document.getElementById('date-from').valueAsDate = thirtyDaysAgo;
    
    await loadDailySummary();
  }

  async function loadDailySummary() {
    try {
      const dateFrom = document.getElementById('date-from').value || '2020-01-01';
      const dateTo = document.getElementById('date-to').value || new Date().toISOString().split('T')[0];
      
      const summary = await window.electronAPI.getDailySummary(dateFrom, dateTo);
      const summaryBody = document.getElementById('daily-summary-body');
      summaryBody.innerHTML = '';
      
      if (summary.length === 0) {
        summaryBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No data for selected period</td></tr>';
        return;
      }
      
      summary.forEach(day => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${day.date}</td>
          <td>₱${day.revenue}</td>
          <td>${day.sessions}</td>
        `;
        summaryBody.appendChild(row);
      });
    } catch (error) {
      console.error('Failed to load daily summary:', error);
    }
  }

  // Filter button
  document.getElementById('filter-btn').addEventListener('click', loadDailySummary);

  // ============ EXPORT TO CSV ============
  document.getElementById('export-csv-btn').addEventListener('click', async () => {
    try {
      const dateFrom = document.getElementById('date-from').value || '2020-01-01';
      const dateTo = document.getElementById('date-to').value || new Date().toISOString().split('T')[0];
      
      const transactions = await window.electronAPI.getAllTransactions(dateFrom, dateTo);
      
      if (transactions.length === 0) {
        alert('No transactions to export');
        return;
      }
      
      // Create CSV content
      let csv = 'Unit,Amount,Date Time\n';
      transactions.forEach(t => {
        csv += `PC ${t.unit_id},₱${t.coin_value},${t.inserted_at}\n`;
      });
      
      // Create download link
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pisonet-transactions-${dateFrom}-to-${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      alert('CSV exported successfully!');
    } catch (error) {
      console.error('Failed to export CSV:', error);
      alert('Failed to export CSV');
    }
  });

  // Auto-refresh dashboard every 5 seconds if active
  setInterval(() => {
    if (!isAuthenticated) return;
    const dashboardView = document.getElementById('dashboard-view');
    if (dashboardView && dashboardView.classList.contains('active')) {
      loadDashboard();
    }
  }, 5000);
  
  // ============ SETTINGS ============
  const saveSyncBtn = document.getElementById('save-sync-btn');
  const enableSyncCheckbox = document.getElementById('enable-sync');
  
  if (saveSyncBtn) {
    saveSyncBtn.addEventListener('click', () => {
      syncServer = document.getElementById('sync-server').value;
      syncWsPort = document.getElementById('sync-ws-port').value;
      syncEnabled = enableSyncCheckbox.checked;
      
      // Disconnect existing connection
      if (ws) {
        ws.close();
        ws = null;
      }
      
      // Connect if enabled
      if (syncEnabled) {
        connectWebSocket();
        alert('Sync enabled! Connecting to server...');
      } else {
        alert('Sync disabled');
      }
    });
  }
  
  // Password change
  const changePasswordBtn = document.getElementById('change-password-btn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const msgEl = document.getElementById('password-change-msg');
      
      if (!currentPassword || !newPassword || !confirmPassword) {
        msgEl.textContent = 'Please fill in all fields';
        msgEl.className = 'status-msg error';
        return;
      }
      
      if (newPassword !== confirmPassword) {
        msgEl.textContent = 'New passwords do not match';
        msgEl.className = 'status-msg error';
        return;
      }
      
      if (newPassword.length < 6) {
        msgEl.textContent = 'Password must be at least 6 characters';
        msgEl.className = 'status-msg error';
        return;
      }
      
      try {
        const result = await window.electronAPI.changePassword(currentPassword, newPassword);
        if (result.success) {
          msgEl.textContent = result.message;
          msgEl.className = 'status-msg success';
          document.getElementById('current-password').value = '';
          document.getElementById('new-password').value = '';
          document.getElementById('confirm-password').value = '';
        } else {
          msgEl.textContent = result.message;
          msgEl.className = 'status-msg error';
        }
      } catch (error) {
        msgEl.textContent = 'Failed to change password';
        msgEl.className = 'status-msg error';
      }
    });
  }
  
  } // End initializeApp

}); // End DOMContentLoaded