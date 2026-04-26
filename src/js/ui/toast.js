import { namedAsset, assetUrl } from '../utils/assets.js';
const BASE = import.meta.env.BASE_URL;

export function showToast(message, duration = 2500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text);
    color: white;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    z-index: 2000;
    animation: popIn 0.3s ease;
    box-shadow: var(--shadow-lg);
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showRewardPopup(options) {
  return new Promise((resolve) => {
    const { crowSprite, title, details, seedsAmount, sticksAmount, stepsAmount, extraImage, extraImageStyle, onDismiss } = options;

    const overlay = document.createElement('div');
    overlay.className = 'reward-popup';

    let detailsHtml = '';
    if (details) {
      if (Array.isArray(details)) {
        detailsHtml = details.map(d => `<p class="reward-popup__detail">${d}</p>`).join('');
      } else {
        detailsHtml = `<p class="reward-popup__detail">${details}</p>`;
      }
    }

    overlay.innerHTML = `
      <div class="reward-popup__content">
        <img class="reward-popup__crow" src="${namedAsset(crowSprite)}" alt="">
        <div class="reward-popup__title">${title}</div>
        ${extraImage ? `<img src="${extraImage}" style="max-height:80px;object-fit:contain;margin:8px auto;display:block;${extraImageStyle || ''}" alt="">` : ''}
        ${detailsHtml}
        ${seedsAmount ? `<div class="reward-popup__reward"><img src="${namedAsset('seeds.png')}" class="reward-popup__reward-icon">+${seedsAmount} seed${seedsAmount !== 1 ? 's' : ''}</div>` : ''}
        ${sticksAmount ? `<div class="reward-popup__reward" style="color:var(--brown)"><img src="${namedAsset('stick_pair.png')}" class="reward-popup__reward-icon" style="filter:drop-shadow(1px 0 0 #F5EDD4) drop-shadow(-1px 0 0 #F5EDD4) drop-shadow(0 1px 0 #F5EDD4) drop-shadow(0 -1px 0 #F5EDD4)">+${sticksAmount} stick${sticksAmount !== 1 ? 's' : ''}</div>` : ''}
        ${stepsAmount ? `<div class="reward-popup__reward" style="color:var(--text)"><img src="${assetUrl(`${BASE}assets/bird_footsteps.png`)}" class="reward-popup__reward-icon">+${stepsAmount} step${stepsAmount !== 1 ? 's' : ''}</div>` : ''}
        <button class="btn btn--primary" style="margin-top:16px;width:100%">Continue</button>
      </div>
    `;

    overlay.querySelector('.btn').addEventListener('click', () => {
      overlay.remove();
      if (onDismiss) onDismiss();
      resolve();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        if (onDismiss) onDismiss();
        resolve();
      }
    });

    document.body.appendChild(overlay);
  });
}
