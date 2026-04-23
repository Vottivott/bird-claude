import { createRun } from '../models/run.js';
import { checkAndAwardMilestones } from '../models/streak.js';
import { addSteps } from '../models/hexboard.js';
import { showRewardPopup } from '../ui/toast.js';
import { navigate } from '../router.js';

export function mount(container) {
  const div = document.createElement('div');
  div.className = 'view';

  div.innerHTML = `
    <div class="log-run__animation">
      <img src="/assets/named_selection_borderless_8x_cleaned/57_log_run.png" alt="Log a run" id="crow-img">
    </div>

    <div class="card">
      <div class="card__title">Log Your Run</div>
      <div class="input-row">
        <div class="input-group">
          <label for="run-minutes">Duration (min)</label>
          <input type="number" id="run-minutes" placeholder="30" min="1" max="600" inputmode="numeric">
        </div>
        <div class="input-group">
          <label for="run-distance">Distance (km)</label>
          <input type="number" id="run-distance" placeholder="5.0" min="0.1" max="200" step="0.1" inputmode="decimal">
        </div>
      </div>
      <div id="speed-preview" style="text-align:center;color:var(--text-light);font-size:14px;margin-bottom:12px"></div>
      <button class="btn btn--accent btn--large" id="btn-submit">Log Run</button>
    </div>

    <div class="card" style="text-align:center;color:var(--text-light)">
      <div style="font-size:13px">You earn <strong style="color:var(--accent)">10 seeds</strong> per run</div>
      <div style="font-size:13px">Beat your records for <strong style="color:var(--accent)">+5 bonus</strong></div>
    </div>
  `;

  container.appendChild(div);

  const minutesInput = div.querySelector('#run-minutes');
  const distanceInput = div.querySelector('#run-distance');
  const preview = div.querySelector('#speed-preview');
  const crowImg = div.querySelector('#crow-img');
  const submitBtn = div.querySelector('#btn-submit');

  function updatePreview() {
    const m = parseFloat(minutesInput.value);
    const d = parseFloat(distanceInput.value);
    if (m > 0 && d > 0) {
      const speed = (d / m) * 60;
      preview.textContent = `${speed.toFixed(1)} km/h`;
    } else {
      preview.textContent = '';
    }
  }

  minutesInput.addEventListener('input', updatePreview);
  distanceInput.addEventListener('input', updatePreview);

  submitBtn.addEventListener('click', async () => {
    const minutes = parseFloat(minutesInput.value);
    const distance = parseFloat(distanceInput.value);

    if (!minutes || minutes <= 0 || !distance || distance <= 0) {
      submitBtn.textContent = 'Enter duration & distance';
      submitBtn.style.background = 'var(--red)';
      submitBtn.style.color = 'white';
      setTimeout(() => {
        submitBtn.textContent = 'Log Run';
        submitBtn.style.background = '';
        submitBtn.style.color = '';
      }, 1500);
      return;
    }

    // Show running animation
    crowImg.src = '/assets/named_selection_borderless_8x_cleaned/running_transparent_loop.png';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Running...';

    await new Promise(r => setTimeout(r, 1500));

    const run = createRun(minutes, distance);
    const milestones = checkAndAwardMilestones();
    const steps = Math.ceil(distance);
    addSteps(steps);

    // Show reward
    const details = [
      `${distance.toFixed(1)} km in ${minutes} min (${run.speedKmh.toFixed(1)} km/h)`,
      `+${steps} steps on the map`,
    ];

    let totalSeeds = run.seedsEarned;
    if (run.isFrontierPush) {
      details.push('New personal record!');
    }

    const crowSprite = run.isFrontierPush ? '55_new_record.png' : '54_very_happy.png';

    await showRewardPopup({
      crowSprite,
      title: run.isFrontierPush ? 'New Record!' : 'Run Logged!',
      details,
      seedsAmount: totalSeeds,
    });

    // Show streak milestones if any
    for (const m of milestones) {
      await showRewardPopup({
        crowSprite: '56_streak_bonus.png',
        title: 'Streak Bonus!',
        details: `${m.type} streak milestone reached!`,
        seedsAmount: m.reward,
      });
    }

    navigate('hex');
  });
}
