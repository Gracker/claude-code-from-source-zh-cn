// 为所有代码块新增复制按钮
document.querySelectorAll('pre').forEach((pre) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block-wrapper';
  pre.parentNode?.insertBefore(wrapper, pre);
  wrapper.appendChild(pre);

  const btn = document.createElement('button');
  btn.className = 'copy-button';
  btn.textContent = '复制';
  btn.addEventListener('click', async () => {
    const code = pre.querySelector('code')?.textContent || pre.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      btn.textContent = '已复制！';
      setTimeout(() => { btn.textContent = '复制'; }, 2000);
    } catch {
      btn.textContent = '复制失败';
      setTimeout(() => { btn.textContent = '复制'; }, 2000);
    }
  });
  wrapper.appendChild(btn);
});
