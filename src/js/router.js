const views = {};
let currentView = null;
let container = null;

export function registerView(name, mountFn) {
  views[name] = mountFn;
}

export function navigate(viewName) {
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

function mountView(name) {
  if (!views[name]) name = 'home';
  if (currentView === name) return;

  container.innerHTML = '';
  currentView = name;

  const tabs = document.querySelectorAll('.tab-bar__tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });

  if (views[name]) {
    views[name](container);
  }
}

export function getCurrentView() {
  return currentView;
}
