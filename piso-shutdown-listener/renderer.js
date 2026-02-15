window.addEventListener('DOMContentLoaded', async () => {
  const unitsContainer = document.getElementById('units-container');
  const NUM_UNITS = 10; // simulate 10 units
  const UNIT_COINS = [1, 5, 10]; // coin options

  const units = [];

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
});
