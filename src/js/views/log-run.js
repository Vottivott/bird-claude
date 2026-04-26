import { createRun } from '../models/run.js';
import { checkAndAwardMilestones } from '../models/streak.js';
import { addSteps } from '../models/hexboard.js';
import { showRewardPopup } from '../ui/toast.js';
import { navigate } from '../router.js';
import { namedAsset } from '../utils/assets.js';

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

  let runFrames = [];
  let runFrameIdx = 0;
  let runAnimId = null;
  let runLastTime = 0;
  let runAccum = 0;

  function parseApngFrames(buf) {
    const bytes = new Uint8Array(buf);
    const dv = new DataView(buf);
    const PNG_SIG = bytes.slice(0, 8);
    const frames = [];
    let ihdrChunk = null;
    let pos = 8;
    let currentFctl = null;
    let currentDataChunks = [];
    let imgW = 0, imgH = 0;

    function readChunk() {
      if (pos + 8 > bytes.length) return null;
      const len = dv.getUint32(pos);
      const type = String.fromCharCode(bytes[pos+4], bytes[pos+5], bytes[pos+6], bytes[pos+7]);
      const data = bytes.slice(pos+8, pos+8+len);
      const totalLen = 12 + len;
      pos += totalLen;
      return { type, data, raw: bytes.slice(pos - totalLen, pos) };
    }

    function crc32(data) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function buildPng(ihdr, idatDataArrays) {
      function chunk(type, data) {
        const b = new Uint8Array(12 + data.length);
        const d = new DataView(b.buffer);
        d.setUint32(0, data.length);
        b[4] = type.charCodeAt(0); b[5] = type.charCodeAt(1);
        b[6] = type.charCodeAt(2); b[7] = type.charCodeAt(3);
        b.set(data, 8);
        d.setUint32(8 + data.length, crc32(b.slice(4, 8 + data.length)));
        return b;
      }
      const parts = [PNG_SIG, ihdr, ...idatDataArrays.map(d => chunk('IDAT', d))];
      const iend = new Uint8Array([0,0,0,0, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82]);
      parts.push(iend);
      const total = parts.reduce((s, p) => s + p.length, 0);
      const result = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { result.set(p, off); off += p.length; }
      return result;
    }

    function flushFrame() {
      if (!currentFctl || currentDataChunks.length === 0) return;
      const fctl = currentFctl;
      const delayNum = (fctl[20] << 8) | fctl[21];
      const delayDen = (fctl[22] << 8) | fctl[23];
      const delay = (delayNum / (delayDen || 100)) * 1000;
      const fw = (fctl[4] << 24 | fctl[5] << 16 | fctl[6] << 8 | fctl[7]) >>> 0;
      const fh = (fctl[8] << 24 | fctl[9] << 16 | fctl[10] << 8 | fctl[11]) >>> 0;
      const ihdrData = new Uint8Array(ihdrChunk.data);
      const frameIhdr = new Uint8Array(ihdrData.length);
      frameIhdr.set(ihdrData);
      const fihdr = new DataView(frameIhdr.buffer);
      fihdr.setUint32(0, fw);
      fihdr.setUint32(4, fh);
      const ihdrFull = new Uint8Array(12 + frameIhdr.length);
      const ihdrDv = new DataView(ihdrFull.buffer);
      ihdrDv.setUint32(0, frameIhdr.length);
      ihdrFull[4] = 0x49; ihdrFull[5] = 0x48; ihdrFull[6] = 0x44; ihdrFull[7] = 0x52;
      ihdrFull.set(frameIhdr, 8);
      ihdrDv.setUint32(8 + frameIhdr.length, crc32(ihdrFull.slice(4, 8 + frameIhdr.length)));
      frames.push({ pngData: buildPng(ihdrFull, currentDataChunks), delay });
      currentFctl = null;
      currentDataChunks = [];
    }

    let c;
    while ((c = readChunk())) {
      if (c.type === 'IHDR') {
        ihdrChunk = c;
        imgW = dv.getUint32(16);
        imgH = dv.getUint32(20);
      } else if (c.type === 'fcTL') {
        if (currentFctl) flushFrame();
        currentFctl = c.data;
      } else if (c.type === 'IDAT') {
        if (currentFctl) currentDataChunks.push(c.data);
        else currentDataChunks.push(c.data);
      } else if (c.type === 'fdAT') {
        currentDataChunks.push(c.data.slice(4));
      }
    }
    flushFrame();
    return { frames, width: imgW, height: imgH };
  }

  let framesReady = (async () => {
    try {
      const res = await fetch(namedAsset('running_transparent_loop.png'));
      const buf = await res.arrayBuffer();
      const { frames, width, height } = parseApngFrames(buf);
      const loaded = await Promise.all(frames.map(f => {
        const blob = new Blob([f.pngData], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        return new Promise(resolve => {
          img.onload = () => resolve({ img, delay: f.delay });
          img.onerror = () => resolve(null);
          img.src = url;
        });
      }));
      runFrames = loaded.filter(Boolean);
      if (runFrames.length) {
        crowCanvas.width = width;
        crowCanvas.height = height;
        const displayH = 160;
        const displayW = Math.round(width * displayH / height);
        crowCanvas.style.width = displayW + 'px';
        crowCanvas.style.height = displayH + 'px';
      }
    } catch (e) {
      console.warn('Running APNG preload failed:', e);
    }
  })();

  function animateRunFrames(now) {
    if (!runFrames.length) return;
    const dt = runLastTime ? now - runLastTime : 0;
    runLastTime = now;
    runAccum += dt;
    const frame = runFrames[runFrameIdx];
    if (runAccum >= frame.delay) {
      runAccum -= frame.delay;
      runFrameIdx = (runFrameIdx + 1) % runFrames.length;
    }
    crowCtx.clearRect(0, 0, crowCanvas.width, crowCanvas.height);
    crowCtx.drawImage(runFrames[runFrameIdx].img, 0, 0);
    runAnimId = requestAnimationFrame(animateRunFrames);
  }

  async function startCrowRunning() {
    await framesReady;
    if (runFrames.length) {
      crowImg.style.display = 'none';
      crowCanvas.style.display = '';
      runLastTime = 0;
      runAccum = 0;
      runAnimId = requestAnimationFrame(animateRunFrames);
    }
  }

  function stopCrowRunning() {
    if (runAnimId) {
      cancelAnimationFrame(runAnimId);
      runAnimId = null;
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
    let steps = Math.ceil(distance);
    if (run.isFrontierPush) steps += 1;
    addSteps(steps);

    const details = [
      `${distance.toFixed(1)} km in ${minutes} min (${run.speedKmh.toFixed(1)} km/h)`,
    ];

    if (run.isFrontierPush) {
      details.push('New personal record! +1 bonus step');
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
    if (runAnimId) cancelAnimationFrame(runAnimId);
  };
}
