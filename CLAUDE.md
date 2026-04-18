# CLAUDE.md

## 这个项目是什么？

《Claude Code from Source》是一本分析 Anthropic Claude Code CLI 架构的技术书，通过 npm 泄漏的源码映射（Source Map）做逆向工程，整体写法对齐 O'Reilly 风格的技术书。

## 项目结构

```
claude-code-from-source/
  README.md                    # 书籍封面、目录、关键模式
  CLAUDE.md                    # 本文件
  book/                        # 书籍内容（18 章，Markdown 格式）
    ch01-architecture.md
    ch02-bootstrap.md
    ch03-state.md
    ch04-api-layer.md
    ch05-agent-loop.md
    ch06-tools.md
    ch07-concurrency.md
    ch08-sub-agents.md
    ch09-fork-agents.md
    ch10-coordination.md
    ch11-memory.md
    ch12-extensibility.md
    ch13-terminal-ui.md
    ch14-input-interaction.md
    ch15-mcp.md
    ch16-remote.md
    ch17-performance.md
    ch18-epilogue.md
  prompts/                     # 可重复使用的书籍生成提示词
  web/                         # 静态 Web 应用（Astro，未来计划）
  .reference/                  # 仅本地使用的素材（已加入 gitignore）
    src/                       # 原始源码文件
    analysis-notes/            # 探索阶段的原始分析笔记
```

## 关键规则

### 内容规则
- **禁止逐字复制源码。** 所有代码块必须是使用不同变量名的伪代码。本书教的是模式，而非实现。
- **使用 Mermaid 绘制图表。** 使用 ```mermaid 围栏代码块，在 GitHub 和 Web 应用中都能渲染。
- **每章结构：开场 → 正文 → 「实践应用」。**「实践应用」段落恰好包含 5 个可转移的模式。
- **一个概念，一个归属。** 不要在两个章节中解释同一件事。改用交叉引用。

### 语气
- 专家对专家的解说。直接、有主见、无废话。
- 「这很巧妙，因为……」而非「值得注意的是……」
- 每个句子都在教某些东西，或为下一个要教的东西做铺垫。

### Git 规则
- `.reference/` 已加入 gitignore —— 永远不要提交源码文件或原始分析
- 若提交历史中包含敏感内容，推送前先压缩（squash）
- 提交消息：写明改了什么以及为什么，而非列出修改了哪些文件

## 仓库
- GitHub: alejandrobalderas/claude-code-from-source
- 未来域名：待定（考虑 claude-code-from-source.com）

## 技术栈（Web 应用，未来计划）
- Astro 用于静态网站生成
- 需要时使用 React 组件
- Tailwind 用于样式设计
- Mermaid.js 用于图表渲染
- GitHub Pages 用于托管

## 书籍统计
- 18 章，7 个部分 + 结语
- 约 6,200 行 Markdown
- 约 400 页等量内容
- 25+ 张 Mermaid 图表
- 由 36 个 AI 代理在约 6 小时内完成
