import { Chart, ScatterController, PointElement, LinearScale, Tooltip, Legend } from 'chart.js';
import * as store from '../store.js';
import { computeFrontier } from '../models/frontier.js';
import { namedAsset } from '../utils/assets.js';

Chart.register(ScatterController, PointElement, LinearScale, Tooltip, Legend);

const frontierPlugin = {
  id: 'frontierFill',
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    if (!dataset || dataset.data.length < 2) return;

    const points = dataset.data.map(d => ({ x: d.x, y: d.y }));
    const hull = computeFrontier(store.getRuns());
    if (hull.length < 2) return;

    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    ctx.save();
    ctx.beginPath();

    const first = hull[0];
    ctx.moveTo(xScale.getPixelForValue(first.x), yScale.getPixelForValue(first.y));

    for (let i = 1; i < hull.length; i++) {
      ctx.lineTo(xScale.getPixelForValue(hull[i].x), yScale.getPixelForValue(hull[i].y));
    }

    const last = hull[hull.length - 1];
    ctx.lineTo(xScale.getPixelForValue(last.x), yScale.getPixelForValue(0));
    ctx.lineTo(xScale.getPixelForValue(first.x), yScale.getPixelForValue(0));
    ctx.closePath();

    ctx.fillStyle = 'rgba(94, 107, 122, 0.15)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xScale.getPixelForValue(hull[0].x), yScale.getPixelForValue(hull[0].y));
    for (let i = 1; i < hull.length; i++) {
      ctx.lineTo(xScale.getPixelForValue(hull[i].x), yScale.getPixelForValue(hull[i].y));
    }
    ctx.strokeStyle = 'rgba(94, 107, 122, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();

    ctx.restore();
  },
};

let chartInstance = null;

export function mount(container) {
  const div = document.createElement('div');
  div.className = 'view';

  const runs = store.getRuns();

  div.innerHTML = `
    <div class="crow-display">
      <img src="${namedAsset(runs.length > 0 ? '52_happy1.png' : '38_pointing_to_the_right.png')}" alt="Crow">
    </div>

    <div class="records-chart">
      <div class="card__title">Your Records</div>
      <div style="position:relative;height:280px">
        <canvas id="records-canvas"></canvas>
      </div>
    </div>

    ${runs.length === 0 ? `
      <div class="empty-state">
        <p>Log your first run to see your records here!</p>
      </div>
    ` : `
      <div class="card">
        <div class="card__title">Stats</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--primary)">${Math.max(...runs.map(r => r.speedKmh)).toFixed(1)}</div>
            <div style="font-size:12px;color:var(--text-light)">Top Speed (km/h)</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:700;color:var(--primary)">${Math.max(...runs.map(r => r.distanceKm)).toFixed(1)}</div>
            <div style="font-size:12px;color:var(--text-light)">Longest Run (km)</div>
          </div>
        </div>
      </div>
    `}

    ${runs.length > 0 ? `
      <div class="card">
        <div class="card__title">Run History</div>
        <div id="run-history"></div>
      </div>
    ` : ''}
  `;

  container.appendChild(div);

  const canvas = div.querySelector('#records-canvas');
  const ctx = canvas.getContext('2d');

  const data = runs.map(r => ({
    x: r.distanceKm,
    y: r.speedKmh,
  }));

  chartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Runs',
        data,
        pointBackgroundColor: runs.map(r =>
          r.isFrontierPush ? '#D4A830' : '#5E6B7A'
        ),
        pointBorderColor: runs.map(r =>
          r.isFrontierPush ? '#A88520' : '#3E4B5A'
        ),
        pointRadius: runs.map(r => r.isFrontierPush ? 8 : 6),
        pointBorderWidth: 2,
        pointHoverRadius: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: 'Distance (km)', font: { size: 13, weight: '600' } },
          min: 0,
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          title: { display: true, text: 'Speed (km/h)', font: { size: 13, weight: '600' } },
          min: 0,
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#3A3A3A',
          cornerRadius: 8,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const run = runs[ctx.dataIndex];
              return [
                `${run.distanceKm.toFixed(1)} km at ${run.speedKmh.toFixed(1)} km/h`,
                `${run.durationMinutes} min`,
                run.isFrontierPush ? 'Record!' : '',
              ].filter(Boolean);
            },
          },
        },
      },
    },
    plugins: [frontierPlugin],
  });

  // Run history
  const historyContainer = div.querySelector('#run-history');
  if (historyContainer) {
    const sortedRuns = [...runs].reverse();
    historyContainer.innerHTML = sortedRuns.slice(0, 20).map(r => {
      const date = new Date(r.date);
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5">
          <div>
            <div style="font-weight:600;font-size:14px">${r.distanceKm.toFixed(1)} km - ${r.durationMinutes} min</div>
            <div style="font-size:12px;color:var(--text-light)">${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:600;color:var(--primary)">${r.speedKmh.toFixed(1)} km/h</div>
            ${r.isFrontierPush ? '<span class="badge badge--seeds" style="font-size:11px">Record</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  return () => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  };
}
