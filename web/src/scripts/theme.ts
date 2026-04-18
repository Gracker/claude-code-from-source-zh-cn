// 主题切换：系统 / 浅色 / 深色
// 内嵌版本在 <head> 中执行以防止闪烁（参见 BaseLayout）

export function getTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark') return 'dark';
  if (stored === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  if (theme === 'system') {
    localStorage.removeItem('theme');
  } else {
    localStorage.setItem('theme', theme);
  }
  applyTheme();
  // 通知 React 组件更新其色彩配置
  window.dispatchEvent(new CustomEvent('theme-changed'));
}

export function applyTheme() {
  const theme = getTheme();
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function toggleTheme() {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : 'dark');
}
