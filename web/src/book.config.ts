export interface PartConfig {
  number: number;
  title: string;
  epigraph: string;
  chapters: number[];
}

export interface ChapterConfig {
  number: number;
  slug: string;
  title: string;
  description: string;
}

export const parts: PartConfig[] = [
  {
    number: 1,
    title: '基础',
    epigraph: '在代理能思考之前，进程必须先存在。',
    chapters: [1, 2, 3, 4],
  },
  {
    number: 2,
    title: '核心循环',
    epigraph: '代理的心跳：串流、行动、观察、重复。',
    chapters: [5, 6, 7],
  },
  {
    number: 3,
    title: '多代理协作',
    epigraph: '一个代理很强大。多个代理协同运作则能带来变革。',
    chapters: [8, 9, 10],
  },
  {
    number: 4,
    title: '持久化与智慧',
    epigraph: '没有记忆的代理会永远犯同样的错误。',
    chapters: [11, 12],
  },
  {
    number: 5,
    title: '接口',
    epigraph: '使用者看到的一切都通过这一层。',
    chapters: [13, 14],
  },
  {
    number: 6,
    title: '连接性',
    epigraph: '代理的触及范围超越了 localhost。',
    chapters: [15, 16],
  },
  {
    number: 7,
    title: '性能工程',
    epigraph: '让一切快到人类察觉不到背后的机制。',
    chapters: [17, 18],
  },
];

export const chapters: ChapterConfig[] = [
  { number: 1, slug: 'ch01-architecture', title: 'AI 代理的架构', description: '六大关键抽象、数据流、权限系统、构建系统' },
  { number: 2, slug: 'ch02-bootstrap', title: '启动引导 —— 启动引导管线', description: '五阶段初始化、模块级 I/O 并行、信任边界' },
  { number: 3, slug: 'ch03-state', title: '状态 —— 双层架构', description: '启动引导单例、AppState 存储、黏性闩锁、成本追踪' },
  { number: 4, slug: 'ch04-api-layer', title: '与 Claude 对话 —— API 层', description: '多供应商客户端、提示缓存、串流、错误复原' },
  { number: 5, slug: 'ch05-agent-loop', title: '代理循环', description: 'query.ts 深入剖析、四层压缩、错误复原、token 预算' },
  { number: 6, slug: 'ch06-tools', title: '工具 —— 从定义到执行', description: '工具接口、14 步管线、权限系统' },
  { number: 7, slug: 'ch07-concurrency', title: '并行工具执行', description: '分割演算法、串流执行器、推测性执行' },
  { number: 8, slug: 'ch08-sub-agents', title: '派生子代理', description: 'AgentTool、15 步 runAgent 生命周期、内置代理类型' },
  { number: 9, slug: 'ch09-fork-agents', title: '分叉代理与提示缓存', description: '位元组级相同前缀技巧、缓存共享、成本最佳化' },
  { number: 10, slug: 'ch10-coordination', title: '任务、协调与群集', description: '任务状态机、协调者模式、群集消息传递' },
  { number: 11, slug: 'ch11-memory', title: '记忆 —— 跨对话学习', description: '基于文件的记忆、四类分类法、LLM 召回、过期处理' },
  { number: 12, slug: 'ch12-extensibility', title: '可扩展性 —— 技能与钩子', description: '两阶段技能加载、生命周期钩子、快照安全性' },
  { number: 13, slug: 'ch13-terminal-ui', title: '终端 UI', description: '自订 Ink 分支、渲染管线、双缓冲、对象池' },
  { number: 14, slug: 'ch14-input-interaction', title: '输入与互动', description: '按键解析、键绑定、组合键支持、Vim 模式' },
  { number: 15, slug: 'ch15-mcp', title: 'MCP —— 通用工具协议', description: '八种传输方式、MCP OAuth、工具包装' },
  { number: 16, slug: 'ch16-remote', title: '远端控制与云端执行', description: 'Bridge v1/v2、CCR、上游代理' },
  { number: 17, slug: 'ch17-performance', title: '性能 —— 每一毫秒与 token 都至关重要', description: '启动、上下文视窗、提示缓存、渲染、搜寻' },
  { number: 18, slug: 'ch18-epilogue', title: '结语 —— 我们学到了什么', description: '五个架构赌注、可转移的知识、代理的未来方向' },
];

export function getPartForChapter(chapterNumber: number): PartConfig | undefined {
  return parts.find(p => p.chapters.includes(chapterNumber));
}

export function getChapterNumber(slug: string): number {
  const match = slug.match(/^ch(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getAdjacentChapters(chapterNumber: number) {
  const idx = chapters.findIndex(c => c.number === chapterNumber);
  return {
    prev: idx > 0 ? chapters[idx - 1] : null,
    next: idx < chapters.length - 1 ? chapters[idx + 1] : null,
  };
}

export function isFirstChapterOfPart(chapterNumber: number): boolean {
  return parts.some(p => p.chapters[0] === chapterNumber);
}
