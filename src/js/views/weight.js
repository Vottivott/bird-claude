import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';
import * as store from '../store.js';
import { navigate } from '../router.js';
import { namedAsset } from '../utils/assets.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

let chartInstance = null;

function computeEMA(values, alpha = 0.3) {
  if (values.length === 0) return [];
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export function mount(container) {
  const entries = store.getWeightEntries();

  const div = document.createElement('div');
  div.className = 'view';

  div.innerHTML = `
    <div class="crow-display">
      <img src="${namedAsset('58_log_weight.png')}" alt="Crow">
    </div>

    <div class="card">
      <div class="card__title">Log Weight</div>
      <div class="input-group">
        <label for="weight-input">Weight (kg)</label>
        <input type="number" id="weight-input" placeholder="70.0" min="20" max="300" step="0.1" inputmode="decimal">
      </div>
      <button class="btn btn--primary btn--large" id="btn-log-weight">Save</button>
    </div>

    <div class="weight-chart">
      <div class="card__title">Weight Trend</div>
      <div style="position:relative;height:250px">
        <canvas id="weight-canvas"></canvas>
      </div>
    </div>

    ${entries.length > 0 ? `
      <div class="card">
        <div class="card__title">Recent</div>
        <div id="weight-history"></div>
      </div>
    ` : `
      <div class="empty-state">
        <p>Log your first weight to see the trend</p>
      </div>
    `}

    <button class="btn btn--ghost" style="width:100%;margin-top:4px" id="btn-back">Back to Home</button>
  `;

  container.appendChild(div);

  // Chart
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = sorted.map(e => {
    const d = new Date(e.date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const values = sorted.map(e => e.weightKg);
  const ema = computeEMA(values);

  const canvas = div.querySelector('#weight-canvas');
  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Trend',
          data: ema,
          borderColor: '#8B9FD4',
          backgroundColor: 'rgba(139, 159, 212, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          order: 1,
        },
        {
          label: 'Actual',
          data: values,
          borderColor: 'rgba(139, 159, 212, 0.3)',
          borderWidth: 1,
          pointBackgroundColor: '#8B9FD4',
          pointBorderColor: '#6B7FB4',
          pointRadius: 5,
          pointBorderWidth: 2,
          fill: false,
          tension: 0,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: {
          title: { display: true, text: 'kg', font: { size: 13, weight: '600' } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#3A3A3A',
          cornerRadius: 8,
        },
      },
    },
  });

  // History
  const historyContainer = div.querySelector('#weight-history');
  if (historyContainer) {
    const recent = [...entries].reverse().slice(0, 10);
    historyContainer.innerHTML = recent.map(e => {
      const d = new Date(e.date);
      return `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5">
          <span style="font-size:14px;color:var(--text-light)">${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span style="font-weight:600">${e.weightKg.toFixed(1)} kg</span>
        </div>
      `;
    }).join('');
  }

  // Log button
  div.querySelector('#btn-log-weight').addEventListener('click', () => {
    const input = div.querySelector('#weight-input');
    const weight = parseFloat(input.value);
    if (!weight || weight <= 0) return;

    store.addWeightEntry({
      id: 'w_' + Date.now(),
      date: new Date().toISOString(),
      weightKg: weight,
    });

    navigate('weight', { force: true });
  });

  div.querySelector('#btn-back').addEventListener('click', () => navigate('home'));

  return () => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  };
}
