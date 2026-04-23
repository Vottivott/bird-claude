const views = {};
let currentView = null;
let currentCleanup = null;
let container = null;

export function registerView(name, mountFn) {
  views[name] = mountFn;
}

export function navigate(viewName, { force = false } = {}) {
  if (force && currentView === viewName) {
    mountView(viewName, true);
    return;
  }
  if (window.location.hash !== '#' + viewName) {
    window.location.hash = viewName;
  }
}

export function initRouter(containerEl) {
  container = containerEl;

  const handleHash = () => {
    const hash = window.location.hash.slice(1) || 'home';
    mountView(hash);
  };

  window.addEventListener('hashchange', handleHash);
  handleHash();
}

function mountView(name, force = false) {
  if (!views[name]) name = 'home';
  if (currentView === name && !force) return;

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  container.innerHTML = '';
  currentView = name;

  const tabs = document.querySelectorAll('.tab-bar__tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });

  if (views[name]) {
    const result = views[name](container);
    if (typeof result === 'function') {
      currentCleanup = result;
    }
  }
}

export function getCurrentView() {
  return currentView;
}
