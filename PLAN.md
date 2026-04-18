## 工作

完成这个 repo 的简体中文本地化：https://github.com/alejandrobalderas/claude-code-from-source

先通读完整内容，再决定翻译策略。每份文件都由独立 agent 负责完整翻译，覆盖正文、列表、表格、Mermaid 图和界面文案，不能只翻局部。

- 上游 `alejandrobalderas/claude-code-from-source` 目前主体包含：
  - `README.md`
  - `CLAUDE.md`
  - `book/` 18 章 markdown
  - `prompts/` 1 份 prompt 文件
  - `web/` Astro 网站，含 `book.config.ts`、2 个 pages、2 个 layouts、44 个 components、5 个 scripts
- 以「有实际英文内容需要翻译」来算，**预估 75 个独立翻译单位**

## 完整执行规划

### Phase 0 — 建立翻译基线
- [x] 锁定上游来源 commit（`a6d5e452...`）
- [x] 把上游文件结构完整同步到 `claude-code-from-source-zh-cn`
- [x] 先做一份术语与风格规范，作为所有 agent 共用基准
- [x] 定义哪些内容要翻、哪些内容必须保留原文

### Phase 1 — 翻译规范定稿
- [x] 定义专有名词表（例如 Agent Loop、Prompt Cache、Hooks、MCP、Bootstrap、Apply This）
- [x] 定义语气：简体中文技术写作风格，忠实原意，但不保留翻译腔
- [x] 定义不翻译项目：文件名、slug、import path、程序标识符、CSS class、API 名称、包名
- [x] 定义必翻译项目：段落、标题、列表、表格、Mermaid 节点/边标签、图注、UI 字符串、alt/title/aria-label、tooltip 文案

### Phase 2 — 每个文件派独立 agent 执行翻译
- [x] 1 agent / 1 file，不共用输出
- [x] 先翻文件类：`README.md`、`CLAUDE.md`、`book/*.md`、`prompts/*.md`
- [x] 再翻网站内容类：`web/src/book.config.ts`、`pages`、`layouts`、`components`、`scripts`
- [x] 每个 agent 都必须保留原始结构，只改面向读者的文字内容
- [x] Mermaid、表格、代码注解、互动图节点文案全部翻完整

### Phase 3 — 整合与一致性校对
- [x] 做跨章节术语一致性检查（修正 18 处不一致）
- [x] 做网站 UI 字符串一致性检查
- [x] 检查章节标题、Part 名称、epigraph、Apply This 是否统一
- [x] 检查所有内部链接、slug、anchor、import 是否未被误改

### Phase 4 — 验证
- [x] Markdown 结构检查（18/18 通过）
- [x] Mermaid fence 与语法检查（40 区块全部正确）
- [x] Astro/TSX 编译验证（修正 1 处遗失的 `</div>`）
- [x] 网站 build 验证（19 页成功构建）
- [x] 抽样人工审稿，确认不是只翻部分段落

## 建议的翻译切分

### A. 文件组
- [x] `README.md`
- [x] `CLAUDE.md`
- [x] `prompts/analyze-codebase-to-book.md`

### B. 书籍章节组（18 agents）
- [x] `book/ch01-architecture.md`
- [x] `book/ch02-bootstrap.md`
- [x] `book/ch03-state.md`
- [x] `book/ch04-api-layer.md`
- [x] `book/ch05-agent-loop.md`
- [x] `book/ch06-tools.md`
- [x] `book/ch07-concurrency.md`
- [x] `book/ch08-sub-agents.md`
- [x] `book/ch09-fork-agents.md`
- [x] `book/ch10-coordination.md`
- [x] `book/ch11-memory.md`
- [x] `book/ch12-extensibility.md`
- [x] `book/ch13-terminal-ui.md`
- [x] `book/ch14-input-interaction.md`
- [x] 翻译 book/ch15-mcp.md
- [x] 翻译 book/ch16-remote.md
- [x] 翻译 book/ch17-performance.md
- [x] 翻译 book/ch18-epilogue.md
- [x] 翻译 web/src/book.config.ts
- [x] 翻译 web/src/pages/*
- [x] 翻译 web/src/layouts/*
- [x] 翻译 web/src/components/*
- [x] 翻译 web/src/scripts/*
- [x] 全 repo 术语一致性校对
- [x] Mermaid / Markdown / 路由完整性检查
- [x] Astro build 验证
- [x] 最终人工抽查与修订
