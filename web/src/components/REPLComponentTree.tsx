import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

interface ComponentNode {
  id: string;
  name: string;
  description: string;
  lines: string;
  keyProps: string[];
  reRenderTriggers: string[];
  isHotPath: boolean;
  children?: ComponentNode[];
}

// --- Data ---

const componentTree: ComponentNode = {
  id: "repl",
  name: "REPL",
  description:
    "整个互动体验的根编排器。约 9 个区块：导入、功能旗标、状态管理、QueryGuard、消息处理、工具权限流程、会话管理、键绑定设置，以及渲染树。全程由 React Compiler 编译。",
  lines: "~5,000",
  keyProps: ["bootstrapState", "commands", "history", "sessionId"],
  reRenderTriggers: [
    "消息串流 token",
    "工具使用状态变更",
    "权限对话方块开启/关闭",
    "输入模式变更",
  ],
  isHotPath: true,
  children: [
    {
      id: "message-list",
      name: "VirtualMessageList",
      description:
        "使用虚拟卷动渲染对话消息。只挂载可见区域加上缓冲区的消息。每则消息有高度缓存，当终端字段变更时失效。支持搜寻导航的跳转控制器。",
      lines: "~800",
      keyProps: ["messages", "scrollTop", "viewportHeight", "searchQuery"],
      reRenderTriggers: [
        "新消息新增",
        "卷动位置变更",
        "搜寻高亮更新",
      ],
      isHotPath: true,
      children: [
        {
          id: "user-message",
          name: "UserMessage",
          description:
            "使用者输入区块。包裹在 MessageRow 中。包含提示文字和任何附加的图片。",
          lines: "~150",
          keyProps: ["content", "images", "index"],
          reRenderTriggers: ["仅挂载时（静态内容）"],
          isHotPath: false,
        },
        {
          id: "assistant-message",
          name: "StreamingMarkdown",
          description:
            "带有串流 Markdown 的模型输出。通过模块级别 LRU（500 个字段）进行 token 缓存。纯文字快速路径可绕过 GFM 解析器。通过 React Suspense 延迟加载语法高亮。",
          lines: "~400",
          keyProps: ["content", "isStreaming", "highlight"],
          reRenderTriggers: [
            "每个新 token（10-50/秒）",
            "语法高亮解析完成",
          ],
          isHotPath: true,
        },
        {
          id: "tool-result",
          name: "ToolUseBlock",
          description:
            "工具执行结果。显示工具名称、状态（执行中/完成/错误），以及可收合的输出。执行时包含经过时间计数器。",
          lines: "~300",
          keyProps: ["toolName", "status", "result", "elapsed"],
          reRenderTriggers: [
            "状态变更（执行中->完成）",
            "经过时间计数器",
          ],
          isHotPath: false,
        },
        {
          id: "offscreen-freeze",
          name: "OffscreenFreeze",
          description:
            "性能最佳化：当消息卷动到可见区域之上时，缓存 React 元素并冻结子树。防止离屏消息中的计时器更新（转圈、经过时间计数器）触发终端重置。",
          lines: "~60",
          keyProps: ["isVisible", "children"],
          reRenderTriggers: ["仅可见性变更"],
          isHotPath: false,
        },
      ],
    },
    {
      id: "input-area",
      name: "PromptInput",
      description:
        "带有键绑定、vim 模式和自动完成的文字输入。管理插入/一般模式状态、游标位置和多行编辑。",
      lines: "~600",
      keyProps: ["mode", "value", "cursorPosition", "vimState"],
      reRenderTriggers: ["每次按键", "模式变更（插入/一般/vim）"],
      isHotPath: true,
      children: [
        {
          id: "prompt-line",
          name: "PromptLine",
          description:
            "\">\" 提示符和模式指示器。显示当前模式（插入/一般/vim）、等待中的组合键前缀，以及模型名称。",
          lines: "~80",
          keyProps: ["mode", "pendingChord", "modelName"],
          reRenderTriggers: ["模式变更", "组合键状态变更"],
          isHotPath: false,
        },
        {
          id: "multi-line-editor",
          name: "MultiLineEditor",
          description:
            "处理多行输入的文字编辑器组件。通过 useDeclaredCursor 声明游标以支持 IME/CJK。具备字形边界感知的自动换行。",
          lines: "~350",
          keyProps: ["value", "cursor", "selection", "wrap"],
          reRenderTriggers: ["每次按键", "选取范围变更"],
          isHotPath: true,
        },
      ],
    },
    {
      id: "status-bar",
      name: "StatusLine",
      description:
        "底部状态列，显示模型名称、累计成本、token 数量和背景任务指示器。每次 API 回应时以新的 token/成本数据更新。",
      lines: "~120",
      keyProps: ["model", "cost", "tokens", "activeTasks"],
      reRenderTriggers: ["API 回应（成本/token 更新）", "任务状态变更"],
      isHotPath: false,
    },
    {
      id: "permission-prompt",
      name: "PermissionRequest",
      description:
        "工具权限核准的模态对话方块。显示工具名称、描述、建议权限。通过 Confirmation 上下文处理 y/n/a（允许一次/拒绝/永远允许）键绑定。",
      lines: "~250",
      keyProps: ["toolName", "description", "suggestions", "onAllow", "onDeny"],
      reRenderTriggers: ["新的权限请求"],
      isHotPath: false,
    },
    {
      id: "keybinding-setup",
      name: "KeybindingSetup",
      description:
        "绑定按键提供者：GlobalKeybindingHandlers、CommandKeybindingHandlers、CancelRequestHandler。管理上下文注册和组合键攎截器。",
      lines: "~200",
      keyProps: ["bindings", "contexts", "handlers"],
      reRenderTriggers: ["上下文激活/停用"],
      isHotPath: false,
    },
    {
      id: "logo-header",
      name: "LogoHeader",
      description:
        "带有 Claude 品牌、模型信息和会话 ID 的请求头。在消息列表顶部渲染一次。",
      lines: "~40",
      keyProps: ["sessionId", "model"],
      reRenderTriggers: ["仅挂载时"],
      isHotPath: false,
    },
  ],
};

const dataFlowSteps = [
  { from: "input-area", label: "使用者输入并按下 Enter" },
  { from: "repl", label: "REPL 以消息呼叫 query()" },
  { from: "assistant-message", label: "Token 串流至 StreamingMarkdown" },
  { from: "tool-result", label: "工具呼叫时出现 ToolUseBlock" },
  { from: "status-bar", label: "StatusLine 更新成本/token 计数" },
  { from: "message-list", label: "VirtualMessageList 卷动到底部" },
];

// --- Helpers ---

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    window.addEventListener("theme-changed", check);
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      window.removeEventListener("theme-changed", check);
      observer.disconnect();
    };
  }, []);
  return isDark;
}

function flattenTree(node: ComponentNode): ComponentNode[] {
  const result: ComponentNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child));
    }
  }
  return result;
}

// --- Component ---

interface Props {
  className?: string;
}

export default function REPLComponentTree({ className }: Props) {
  const isDark = useDarkMode();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["repl", "message-list", "input-area"])
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDataFlow, setShowDataFlow] = useState(false);
  const [dataFlowStep, setDataFlowStep] = useState(-1);
  const dataFlowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const colors = {
    text: isDark ? "#f5f4ed" : "#141413",
    textSecondary: "#87867f",
    cardBg: isDark ? "#1e1e1c" : "#ffffff",
    cardBorder: isDark ? "#333" : "#e8e6dc",
    terracotta: "#d97757",
    terracottaBg: isDark
      ? "rgba(217, 119, 87, 0.15)"
      : "rgba(217, 119, 87, 0.08)",
    surfaceBg: isDark ? "#141413" : "#f5f4ed",
    hotPath: isDark ? "rgba(237, 161, 0, 0.15)" : "rgba(237, 161, 0, 0.08)",
    hotPathBorder: "#eda100",
    treeLine: isDark ? "#444" : "#d4d2c8",
    selectedBg: isDark
      ? "rgba(217, 119, 87, 0.12)"
      : "rgba(217, 119, 87, 0.06)",
  };

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleDataFlow = useCallback(() => {
    if (showDataFlow) {
      setShowDataFlow(false);
      setDataFlowStep(-1);
      if (dataFlowTimerRef.current) {
        clearInterval(dataFlowTimerRef.current);
        dataFlowTimerRef.current = null;
      }
      return;
    }

    setShowDataFlow(true);
    setDataFlowStep(0);
    // Expand all nodes to show the flow
    setExpandedIds(
      new Set(flattenTree(componentTree).map((n) => n.id))
    );

    let step = 0;
    dataFlowTimerRef.current = setInterval(() => {
      step++;
      if (step >= dataFlowSteps.length) {
        if (dataFlowTimerRef.current) {
          clearInterval(dataFlowTimerRef.current);
          dataFlowTimerRef.current = null;
        }
        return;
      }
      setDataFlowStep(step);
    }, 1200);
  }, [showDataFlow]);

  useEffect(() => {
    return () => {
      if (dataFlowTimerRef.current) clearInterval(dataFlowTimerRef.current);
    };
  }, []);

  const allNodes = flattenTree(componentTree);
  const selectedNode = selectedId
    ? allNodes.find((n) => n.id === selectedId)
    : null;

  function renderNode(node: ComponentNode, depth: number = 0) {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedId === node.id;
    const isDataFlowActive =
      showDataFlow &&
      dataFlowStep >= 0 &&
      dataFlowStep < dataFlowSteps.length &&
      dataFlowSteps[dataFlowStep].from === node.id;

    return (
      <div key={node.id}>
        <motion.div
          animate={{
            backgroundColor: isDataFlowActive
              ? colors.terracottaBg
              : isSelected
              ? colors.selectedBg
              : "transparent",
          }}
          transition={{ duration: 0.3 }}
          onClick={() => setSelectedId(isSelected ? null : node.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            paddingLeft: depth * 24 + 10,
            borderRadius: 6,
            cursor: "pointer",
            position: "relative",
            borderLeft: isDataFlowActive
              ? `2px solid ${colors.terracotta}`
              : "2px solid transparent",
            transition: "border-color 0.3s",
          }}
        >
          {/* Tree lines */}
          {depth > 0 &&
            Array.from({ length: depth }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: i * 24 + 20,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: colors.treeLine,
                }}
              />
            ))}

          {/* Expand/collapse toggle */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: colors.textSecondary,
                fontSize: 12,
                flexShrink: 0,
                padding: 0,
                fontFamily: "var(--font-mono)",
              }}
            >
              {isExpanded ? (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M2 3.5 L5 6.5 L8 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d="M3.5 2 L6.5 5 L3.5 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ) : (
            <div style={{ width: 18, flexShrink: 0 }} />
          )}

          {/* Component name */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: isSelected ? 600 : 500,
              color: isDataFlowActive
                ? colors.terracotta
                : isSelected
                ? colors.terracotta
                : colors.text,
              transition: "color 0.2s",
            }}
          >
            {"<"}
            {node.name}
            {" />"}
          </span>

          {/* Hot path badge */}
          {node.isHotPath && (
            <span
              style={{
                padding: "1px 6px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 600,
                background: colors.hotPath,
                color: colors.hotPathBorder,
                borderRadius: 4,
                border:  INLINECODE1 ,
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              热路径
            </span>
          )}

          {/* Lines count */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: colors.textSecondary,
              marginLeft: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {node.lines}
          </span>

          {/* Data flow arrow */}
          <AnimatePresence>
            {isDataFlowActive && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: colors.terracotta,
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {dataFlowSteps[dataFlowStep].label}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Children */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              {node.children!.map((child) => renderNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={className} style={{ fontFamily: "var(--font-serif)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          background: colors.cardBg,
          border:  INLINECODE2 ,
          borderRadius: "12px 12px 0 0",
          borderBottom: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: colors.terracotta,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: colors.terracotta,
              fontWeight: 600,
            }}
          >
            REPL 组件阶层
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "2px 8px",
              background: colors.terracottaBg,
              color: colors.terracotta,
              borderRadius: 4,
              fontWeight: 700,
            }}
          >
            ~5,000 lines
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={toggleDataFlow}
            style={{
              padding: "6px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              background: showDataFlow ? colors.terracotta : "transparent",
              color: showDataFlow ? "#fff" : colors.textSecondary,
              border:  INLINECODE3 ,
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {showDataFlow ? "Stop Flow" : "Show Data Flow"}
          </button>
          <button
            onClick={() =>
              setExpandedIds(
                expandedIds.size > 3
                  ? new Set(["repl"])
                  : new Set(flattenTree(componentTree).map((n) => n.id))
              )
            }
            style={{
              padding: "6px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              background: "transparent",
              color: colors.textSecondary,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {expandedIds.size > 3 ? "Collapse" : "Expand All"}
          </button>
        </div>
      </div>

      {/* Tree + Detail */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderRadius: "0 0 12px 12px",
          overflow: "hidden",
          border:  INLINECODE5 ,
        }}
      >
        {/* Tree panel */}
        <div
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            padding: "12px 8px",
            background: colors.cardBg,
            borderRight: selectedNode
              ?  INLINECODE6 
              : "none",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          {renderNode(componentTree)}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                flexShrink: 0,
                background: colors.cardBg,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "16px 20px", width: 320 }}>
                {/* Component name */}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 15,
                    fontWeight: 600,
                    color: colors.terracotta,
                    marginBottom: 4,
                  }}
                >
                  {"<"}
                  {selectedNode.name}
                  {" />"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: colors.textSecondary,
                    marginBottom: 12,
                  }}
                >
                  {selectedNode.lines} 行
                  {selectedNode.isHotPath && (
                    <span style={{ color: colors.hotPathBorder }}>
                      {" "}
                      -- 热路径
                    </span>
                  )}
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: 12,
                    color: colors.text,
                    lineHeight: 1.6,
                    marginBottom: 16,
                  }}
                >
                  {selectedNode.description}
                </p>

                {/* Key Props */}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  主要 Props
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginBottom: 16,
                  }}
                >
                  {selectedNode.keyProps.map((prop) => (
                    <span
                      key={prop}
                      style={{
                        padding: "2px 8px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        background: colors.surfaceBg,
                        color: colors.text,
                        borderRadius: 4,
                        border:  INLINECODE7 ,
                      }}
                    >
                      {prop}
                    </span>
                  ))}
                </div>

                {/* Re-render triggers */}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: 6,
                  }}
                >
                  重新渲染触发器
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {selectedNode.reRenderTriggers.map((trigger) => (
                    <div
                      key={trigger}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        color: colors.textSecondary,
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: selectedNode.isHotPath
                            ? colors.hotPathBorder
                            : colors.terracotta,
                          flexShrink: 0,
                        }}
                      />
                      {trigger}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Data flow legend */}
      <AnimatePresence>
        {showDataFlow && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 12,
              padding: "12px 16px",
              background: colors.cardBg,
              border:  INLINECODE8 ,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: colors.textSecondary,
                marginBottom: 8,
              }}
            >
              消息流程：从使用者输入到渲染输出
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {dataFlowSteps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      background:
                        dataFlowStep >= index
                          ? colors.terracotta
                          : "transparent",
                      color:
                        dataFlowStep >= index ? "#fff" : colors.textSecondary,
                      border: `1.5px solid ${
                        dataFlowStep >= index
                          ? colors.terracotta
                          : colors.cardBorder
                      }`,
                      transition: "all 0.3s",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color:
                        dataFlowStep === index
                          ? colors.terracotta
                          : colors.textSecondary,
                      transition: "color 0.3s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {step.label}
                  </span>
                  {index < dataFlowSteps.length - 1 && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      style={{ flexShrink: 0 }}
                    >
                      <path
                        d="M3 6h6M7 4l2 2-2 2"
                        stroke={
                          dataFlowStep > index
                            ? colors.terracotta
                            : colors.textSecondary
                        }
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transition: "stroke 0.3s" }}
                      />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
