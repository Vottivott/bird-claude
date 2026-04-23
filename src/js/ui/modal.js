export function showModal(contentHtml, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';
  sheet.innerHTML = contentHtml;
  overlay.appendChild(sheet);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onClose) onClose();
    }
  });

  document.body.appendChild(overlay);
  return { overlay, sheet, close: () => { overlay.remove(); if (onClose) onClose(); } };
}
