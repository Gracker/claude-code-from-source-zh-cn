// 专注模式：切换侧边栏和目录的显示，提供无干扰的阅读体验
const layout = document.getElementById('chapter-layout');
const sidebar = document.getElementById('sidebar');
const toc = document.querySelector('aside');
const expandIcon = document.getElementById('focus-icon-expand');
const collapseIcon = document.getElementById('focus-icon-collapse');
const toggleBtn = document.getElementById('focus-toggle');

function applyFocusMode(active: boolean) {
  if (layout) layout.classList.toggle('focus-mode', active);
  if (sidebar) sidebar.classList.toggle('lg:hidden', active);
  if (sidebar) sidebar.classList.toggle('lg:block', !active);
  if (toc) toc.classList.toggle('xl:hidden', active);
  if (toc) toc.classList.toggle('xl:block', !active);

  if (expandIcon && collapseIcon) {
    expandIcon.classList.toggle('hidden', active);
    collapseIcon.classList.toggle('hidden', !active);
  }
}

// 从 localStorage 还原状态
const stored = localStorage.getItem('focus-mode');
if (stored === 'true') {
  applyFocusMode(true);
}

toggleBtn?.addEventListener('click', () => {
  const isActive = layout?.classList.contains('focus-mode') ?? false;
  const newState = !isActive;
  applyFocusMode(newState);
  localStorage.setItem('focus-mode', String(newState));
});
