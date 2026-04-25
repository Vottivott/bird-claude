import { createRun } from '../models/run.js';
import { checkAndAwardMilestones } from '../models/streak.js';
import { addSteps } from '../models/hexboard.js';
import { showRewardPopup } from '../ui/toast.js';
import { navigate } from '../router.js';
import { namedAsset } from '../utils/assets.js';
import parseAPNG from 'apng-js';

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function mount(container) {
  const div = document.createElement('div');
  div.className = 'view';

  let timerStart = null;
  let timerElapsed = 0;
  let timerInterval = null;
  let running = false;

  div.innerHTML = `
    <div class="log-run__animation">
      <img src="${namedAsset('57_log_run.png')}" alt="Log a run" id="crow-img">
      <canvas id="crow-run-canvas" style="display:none;max-height:160px;max-width:200px"></canvas>
    </div>

    <!-- Timer mode (default) -->
    <div id="timer-mode">
      <div class="card" style="text-align:center">
        <div id="timer-display" style="font-size:48px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:2px;color:var(--primary);margin:16px 0">00:00</div>
        <div id="timer-buttons" style="display:flex;gap:10px">
          <button class="btn btn--accent" id="btn-start" style="flex:1;padding:14px;font-size:18px;min-width:0">Start</button>
          <button class="btn btn--ghost" id="btn-reset" style="display:none;flex:1;padding:14px;font-size:16px;min-width:0">Reset</button>
        </div>
      </div>

      <div id="distance-section" style="display:none">
        <div class="card">
          <div class="card__title">How far did you run?</div>
          <div class="input-group">
            <label for="timer-distance">Distance (km)</label>
            <input type="number" id="timer-distance" placeholder="5.0" min="0.1" max="200" step="0.1" inputmode="decimal">
          </div>
          <div id="timer-speed-preview" style="text-align:center;color:var(--text-light);font-size:14px;margin-bottom:12px"></div>
          <button class="btn btn--accent btn--large" id="btn-save-timer">Log Run</button>
        </div>
      </div>

      <div class="card" style="text-align:center;color:var(--text-light)">
        <div style="font-size:13px">You earn <strong style="color:var(--accent)">10 seeds</strong> per run</div>
        <div style="font-size:13px">Beat your records for <strong style="color:var(--accent)">+5 bonus</strong></div>
      </div>

      <button class="btn btn--ghost" id="btn-show-manual" style="width:100%;margin-top:4px;font-size:13px;color:var(--text-muted)">Enter time manually</button>
    </div>

    <!-- Manual mode (hidden by default) -->
    <div id="manual-mode" style="display:none">
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

      <button class="btn btn--ghost" id="btn-show-timer" style="width:100%;margin-top:4px;font-size:13px;color:var(--text-muted)">Use stopwatch instead</button>
    </div>
  `;

  container.appendChild(div);

  const crowImg = div.querySelector('#crow-img');
  const crowCanvas = div.querySelector('#crow-run-canvas');
  const crowCtx = crowCanvas.getContext('2d');
  const timerDisplay = div.querySelector('#timer-display');
  const btnStart = div.querySelector('#btn-start');
  const btnReset = div.querySelector('#btn-reset');
  const distanceSection = div.querySelector('#distance-section');
  const timerDistanceInput = div.querySelector('#timer-distance');
  const timerSpeedPreview = div.querySelector('#timer-speed-preview');
  const btnSaveTimer = div.querySelector('#btn-save-timer');

  let crowPlayer = null;
  (async () => {
    try {
      const res = await fetch(namedAsset('running_transparent_loop.png'));
      const buf = await res.arrayBuffer();
      const apng = parseAPNG(buf);
      if (apng instanceof Error) throw apng;
      crowCanvas.width = apng.width;
      crowCanvas.height = apng.height;
      crowPlayer = await apng.getPlayer(crowCtx);
    } catch (e) {
      console.warn('Running APNG preload failed:', e);
    }
  })();

  function startCrowRunning() {
    if (crowPlayer) {
      crowImg.style.display = 'none';
      crowCanvas.style.display = '';
      crowPlayer.play();
    }
  }

  function stopCrowRunning() {
    if (crowPlayer) {
      crowPlayer.pause();
    }
    crowCanvas.style.display = 'none';
    crowImg.style.display = '';
  }

  // Timer controls
  btnStart.addEventListener('click', () => {
    if (!running && timerElapsed === 0) {
      // Start
      running = true;
      timerStart = Date.now();
      btnStart.textContent = 'Finish';
      btnStart.className = 'btn btn--primary';
      btnStart.style.cssText = 'flex:1;padding:14px;font-size:18px;min-width:0';
      btnReset.style.display = 'none';
      startCrowRunning();
      distanceSection.style.display = 'none';
      timerInterval = setInterval(() => {
        const elapsed = timerElapsed + (Date.now() - timerStart);
        timerDisplay.textContent = formatTime(elapsed);
      }, 200);
    } else if (running) {
      // Finish
      running = false;
      timerElapsed += Date.now() - timerStart;
      clearInterval(timerInterval);
      timerDisplay.textContent = formatTime(timerElapsed);
      btnStart.textContent = 'Resume';
      btnStart.className = 'btn btn--accent';
      btnStart.style.cssText = 'flex:1;padding:14px;font-size:18px;min-width:0';
      btnReset.style.display = '';
      stopCrowRunning();
      distanceSection.style.display = '';
      timerDistanceInput.focus();
    } else {
      // Resume
      running = true;
      timerStart = Date.now();
      btnStart.textContent = 'Finish';
      btnStart.className = 'btn btn--primary';
      btnStart.style.cssText = 'flex:1;padding:14px;font-size:18px;min-width:0';
      btnReset.style.display = 'none';
      startCrowRunning();
      distanceSection.style.display = 'none';
      timerInterval = setInterval(() => {
        const elapsed = timerElapsed + (Date.now() - timerStart);
        timerDisplay.textContent = formatTime(elapsed);
      }, 200);
    }
  });

  btnReset.addEventListener('click', () => {
    running = false;
    timerElapsed = 0;
    timerStart = null;
    clearInterval(timerInterval);
    timerDisplay.textContent = '00:00';
    btnStart.textContent = 'Start';
    btnStart.className = 'btn btn--accent';
    btnStart.style.cssText = 'flex:1;padding:14px;font-size:18px;min-width:0';
    btnReset.style.display = 'none';
    distanceSection.style.display = 'none';
    stopCrowRunning();
    crowImg.src = namedAsset('57_log_run.png');
    timerDistanceInput.value = '';
    timerSpeedPreview.textContent = '';
  });

  // Timer distance preview
  timerDistanceInput.addEventListener('input', () => {
    const d = parseFloat(timerDistanceInput.value);
    const minutes = timerElapsed / 60000;
    if (d > 0 && minutes > 0) {
      const speed = (d / minutes) * 60;
      timerSpeedPreview.textContent = `${minutes.toFixed(0)} min \u2022 ${speed.toFixed(1)} km/h`;
    } else {
      timerSpeedPreview.textContent = '';
    }
  });

  // Save from timer mode
  btnSaveTimer.addEventListener('click', () => {
    const distance = parseFloat(timerDistanceInput.value);
    const minutes = Math.round(timerElapsed / 60000);
    if (!distance || distance <= 0 || minutes <= 0) {
      btnSaveTimer.textContent = 'Enter distance';
      btnSaveTimer.style.background = 'var(--red)';
      btnSaveTimer.style.color = 'white';
      setTimeout(() => {
        btnSaveTimer.textContent = 'Log Run';
        btnSaveTimer.style.background = '';
        btnSaveTimer.style.color = '';
      }, 1500);
      return;
    }
    submitRun(minutes, distance, crowImg, btnSaveTimer);
  });

  // Mode switching
  div.querySelector('#btn-show-manual').addEventListener('click', () => {
    div.querySelector('#timer-mode').style.display = 'none';
    div.querySelector('#manual-mode').style.display = '';
    if (running) {
      running = false;
      timerElapsed += Date.now() - timerStart;
      clearInterval(timerInterval);
    }
    stopCrowRunning();
    crowImg.src = namedAsset('57_log_run.png');
  });

  div.querySelector('#btn-show-timer').addEventListener('click', () => {
    div.querySelector('#manual-mode').style.display = 'none';
    div.querySelector('#timer-mode').style.display = '';
  });

  // Manual mode
  const minutesInput = div.querySelector('#run-minutes');
  const distanceInput = div.querySelector('#run-distance');
  const preview = div.querySelector('#speed-preview');
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

  submitBtn.addEventListener('click', () => {
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
    submitRun(minutes, distance, crowImg, submitBtn);
  });

  async function submitRun(minutes, distance, img, btn) {
    startCrowRunning();
    btn.disabled = true;
    btn.textContent = 'Saving...';

    await new Promise(r => setTimeout(r, 1000));

    const run = createRun(minutes, distance);
    const milestones = checkAndAwardMilestones();
    const steps = Math.ceil(distance);
    addSteps(steps);

    const details = [
      `${distance.toFixed(1)} km in ${minutes} min (${run.speedKmh.toFixed(1)} km/h)`,
    ];

    if (run.isFrontierPush) {
      details.push('New personal record!');
    }

    const crowSprite = run.isFrontierPush ? '55_new_record.png' : '54_very_happy.png';

    await showRewardPopup({
      crowSprite,
      title: run.isFrontierPush ? 'New Record!' : 'Run Logged!',
      details,
      seedsAmount: run.seedsEarned,
      stepsAmount: steps,
    });

    for (const m of milestones) {
      await showRewardPopup({
        crowSprite: '56_streak_bonus.png',
        title: 'Streak Bonus!',
        details: `${m.type} streak milestone reached!`,
        seedsAmount: m.reward,
      });
    }

    navigate('hex');
  }

  return () => {
    clearInterval(timerInterval);
  };
}
