import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

type PlayMode = "idle" | "playing" | "paused" | "done";

interface Participant {
  id: string;
  label: string;
  shortLabel: string;
}

interface SequenceMessage {
  id: number;
  from: string;
  to: string;
  label: string;
  detail: string;
  isLoopBack?: boolean;
  terminalText?: string;
  durationMs: number;
}

// --- Data ---

const participants: Participant[] = [
  { id: "user", label: "使用者 / REPL", shortLabel: "使用者" },
  { id: "query", label: "查询循环", shortLabel: "查询" },
  { id: "model", label: "模型 API", shortLabel: "模型" },
  { id: "executor", label: "StreamingToolExecutor", shortLabel: "执行器" },
  { id: "tools", label: "工具系统", shortLabel: "工具" },
];

const sequence: SequenceMessage[] = [
  {
    id: 1,
    from: "user",
    to: "query",
    label: "使用者消息",
    detail: "REPL 撷取输入，包装为 UserMessage，喂入查询循环产生器",
    terminalText: '> add error handling to the login function\n\n  Thinking...',
    durationMs: 200,
  },
  {
    id: 2,
    from: "query",
    to: "query",
    label: "Token 数量检查",
    detail: "检查上下文视窗使用量。如果对话超出预算则自动压缩",
    terminalText: '> add error handling to the login function\n\n  Thinking... (context: 12,847 tokens)',
    durationMs: 150,
  },
  {
    id: 3,
    from: "query",
    to: "model",
    label: "callModel() 串流请求",
    detail: "系统提示词 + 记忆 + 对话历史发送至 Claude API",
    terminalText: '> add error handling to the login function\n\n  Streaming response...',
    durationMs: 300,
  },
  {
    id: 4,
    from: "model",
    to: "query",
    label: "Token 串流返回",
    detail: "回应以串流区块到达：文字区块和 tool_use 区块交错排列",
    terminalText: '> add error handling to the login function\n\n  I\'ll read the login function first...',
    durationMs: 400,
  },
  {
    id: 5,
    from: "model",
    to: "executor",
    label: "侦测到 tool_use 区块",
    detail: "StreamingToolExecutor 在回应完成前摄截串流中的 tool_use 区块",
    terminalText: '> add error handling to the login function\n\n  I\'ll read the login function first...\n  [tool_use: Read /src/auth/login.ts]',
    durationMs: 250,
  },
  {
    id: 6,
    from: "executor",
    to: "tools",
    label: "提前启动并行安全的工具",
    detail: "唯读工具（Read、Grep）在模型仍在串流时推测性启动",
    terminalText: '> add error handling to the login function\n\n  Read /src/auth/login.ts (speculative)',
    durationMs: 300,
  },
  {
    id: 7,
    from: "tools",
    to: "executor",
    label: "结果（可能在模型之前完成）",
    detail: "工具结果加入队列。如果模型作廉了该呼叫，结果会被丢弃",
    terminalText: '> add error handling to the login function\n\n  Read /src/auth/login.ts -> 156 lines',
    durationMs: 200,
  },
  {
    id: 8,
    from: "query",
    to: "tools",
    label: "执行剩余工具",
    detail: "序列/并行批次：验证 -> 钩子 -> 权限 -> 执行",
    terminalText: '> add error handling to the login function\n\n  Edit /src/auth/login.ts (42 lines changed)',
    durationMs: 350,
  },
  {
    id: 9,
    from: "tools",
    to: "query",
    label: "ToolResultMessages",
    detail: "结果映射为 ContentBlock[]，经过每工具大小限制预算后附加到历史",
    terminalText: '> add error handling to the login function\n\n  Edit applied. Checking if more changes needed...',
    durationMs: 200,
  },
  {
    id: 10,
    from: "query",
    to: "query",
    label: "停止检查：继续循环？",
    detail: "还有工具呼叫待处理？继续循环。没有更多呼叫？产生最终回应",
    isLoopBack: true,
    terminalText: '> add error handling to the login function\n\n  More tool calls detected -> loop continues',
    durationMs: 200,
  },
  {
    id: 11,
    from: "query",
    to: "model",
    label: "循环：更新上下文",
    detail: "工具结果附加至消息历史。以完整上下文再次呼叫模型",
    isLoopBack: true,
    terminalText: '> add error handling to the login function\n\n  Re-entering query loop with tool results...',
    durationMs: 300,
  },
  {
    id: 12,
    from: "model",
    to: "query",
    label: "最终文字回应",
    detail: "没有更多 tool_use 区块。模型产生给使用者的最终文字回应",
    terminalText: '> add error handling to the login function\n\n  Done. Added try-catch blocks with specific\n  error types for auth failures, rate limits,\n  and network errors.',
    durationMs: 400,
  },
  {
    id: 13,
    from: "query",
    to: "user",
    label: "Yield Messages -> 渲染",
    detail: "产生器 yield 最终消息。REPL 通过 Ink 将 markdown 渲染至终端",
    terminalText: '> add error handling to the login function\n\n  Done. Added try-catch blocks with specific\n  error types for auth failures, rate limits,\n  and network errors.\n\n  Files changed: /src/auth/login.ts',
    durationMs: 250,
  },
];

const TOTAL_DURATION = "~3.2 seconds";

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

function ArrowIcon({ direction, color }: { direction: "right" | "left"; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {direction === "right" ? (
        <path d="M2 7h10M9 4l3 3-3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M12 7H2M5 4L2 7l3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function LoopIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11 7a4 4 0 0 1-7.46 2M3 7a4 4 0 0 1 7.46-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 11V9h2M11 3v2h-2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --- Component ---

interface Props {
  className?: string;
}

export default function GoldenPath({ className }: Props) {
  const isDark = useDarkMode();
  const [mode, setMode] = useState<PlayMode>("idle");
  const [currentStep, setCurrentStep] = useState(-1);
  const abortRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = {
    accent: "#d97757",
    accentDim: "rgba(217, 119, 87, 0.3)",
    accentBg: isDark ? "rgba(217, 119, 87, 0.08)" : "rgba(217, 119, 87, 0.05)",
    text: isDark ? "#f5f4ed" : "#141413",
    textSecondary: "#87867f",
    cardBg: isDark ? "#1e1e1c" : "#ffffff",
    cardBorder: isDark ? "#333" : "#e8e6dc",
    terminalBg: isDark ? "#0a0a09" : "#141413",
    terminalText: "#22c55e",
    terminalDim: "#87867f",
    loopBg: isDark ? "rgba(217, 119, 87, 0.12)" : "rgba(217, 119, 87, 0.08)",
  };

  const reset = useCallback(() => {
    abortRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMode("idle");
    setCurrentStep(-1);
  }, []);

  const advanceStep = useCallback((step: number) => {
    if (step >= sequence.length) {
      setMode("done");
      return;
    }
    setCurrentStep(step);
  }, []);

  const playAll = useCallback(async () => {
    reset();
    await new Promise((r) => setTimeout(r, 50));
    abortRef.current = false;
    setMode("playing");

    for (let i = 0; i < sequence.length; i++) {
      if (abortRef.current) return;
      setCurrentStep(i);
      await new Promise<void>((resolve) => {
        timeoutRef.current = setTimeout(resolve, sequence[i].durationMs + 400);
      });
    }
    if (!abortRef.current) {
      setMode("done");
    }
  }, [reset]);

  const stepForward = useCallback(() => {
    if (mode === "idle") {
      setMode("paused");
      setCurrentStep(0);
    } else if (mode === "paused" || mode === "done") {
      const next = currentStep + 1;
      if (next >= sequence.length) {
        setMode("done");
      } else {
        setMode("paused");
        setCurrentStep(next);
      }
    }
  }, [mode, currentStep]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const getParticipantIndex = (id: string) => participants.findIndex((p) => p.id === id);

  const currentMessage = currentStep >= 0 && currentStep < sequence.length ? sequence[currentStep] : null;

  return (
    <div className={className} style={{ fontFamily: "var(--font-serif)" }}>
      {/* Controls */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
          padding: "16px 20px",
          background: colors.cardBg,
          border:  INLINECODE0 ,
          borderRadius: 12,
        }}
      >
        <button
          onClick={mode === "playing" ? reset : playAll}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: mode === "playing" ? colors.textSecondary : colors.accent,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          {mode === "playing" ? "停止" : mode === "done" ? "重播" : "播放"}
        </button>

        <button
          onClick={stepForward}
          disabled={mode === "playing"}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border:  INLINECODE1 ,
            background: colors.cardBg,
            color: mode === "playing" ? colors.textSecondary : colors.text,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            cursor: mode === "playing" ? "not-allowed" : "pointer",
            transition: "background 0.2s",
            opacity: mode === "playing" ? 0.5 : 1,
          }}
        >
          逐步
        </button>

        <button
          onClick={reset}
          disabled={mode === "idle"}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border:  INLINECODE2 ,
            background: colors.cardBg,
            color: mode === "idle" ? colors.textSecondary : colors.text,
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            cursor: mode === "idle" ? "not-allowed" : "pointer",
            opacity: mode === "idle" ? 0.5 : 1,
          }}
        >
          重置
        </button>

        <div style={{ flex: 1, minWidth: 20 }} />

        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: colors.textSecondary,
          }}
        >
          {currentStep >= 0 ? `步驟 ${currentStep + 1}/${sequence.length}` : "就绪"}{" "}
          &middot; 总计：{TOTAL_DURATION}
        </span>
      </div>

      {/* Participant columns header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:  INLINECODE4 ,
          gap: 8,
          marginBottom: 16,
        }}
      >
        {participants.map((p) => {
          const isActive =
            currentMessage &&
            (currentMessage.from === p.id || currentMessage.to === p.id);
          return (
            <motion.div
              key={p.id}
              animate={{
                borderColor: isActive ? colors.accent : colors.cardBorder,
                background: isActive ? colors.accentBg : colors.cardBg,
              }}
              transition={{ duration: 0.3 }}
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                border:  INLINECODE5 ,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: isActive ? colors.accent : colors.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <span className="golden-path-full-label">{p.label}</span>
                <span className="golden-path-short-label">{p.shortLabel}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <style>{`
        .golden-path-short-label { display: none; }
        @media (max-width: 640px) {
          .golden-path-full-label { display: none; }
          .golden-path-short-label { display: inline; }
        }
      `}</style>

      {/* Sequence messages */}
      <div style={{ position: "relative" }}>
        {sequence.map((msg, i) => {
          const fromIdx = getParticipantIndex(msg.from);
          const toIdx = getParticipantIndex(msg.to);
          const isSelf = fromIdx === toIdx;
          const leftCol = Math.min(fromIdx, toIdx);
          const rightCol = Math.max(fromIdx, toIdx);
          const colSpan = rightCol - leftCol + 1;
          const goesRight = toIdx > fromIdx;

          const isVisible = i <= currentStep;
          const isCurrent = i === currentStep;

          return (
            <AnimatePresence key={msg.id}>
              {isVisible && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    display: "grid",
                    gridTemplateColumns:  INLINECODE7 ,
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <motion.div
                    animate={{
                      background: isCurrent
                        ? msg.isLoopBack
                          ? colors.loopBg
                          : colors.accentBg
                        : "transparent",
                      borderColor: isCurrent ? colors.accent : "transparent",
                    }}
                    transition={{ duration: 0.3 }}
                    style={{
                      gridColumn:  INLINECODE8 ,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 36,
                    }}
                  >
                    {msg.isLoopBack ? (
                      <LoopIcon color={isCurrent ? colors.accent : colors.textSecondary} />
                    ) : isSelf ? (
                      <LoopIcon color={isCurrent ? colors.accent : colors.textSecondary} />
                    ) : goesRight ? (
                      <ArrowIcon direction="right" color={isCurrent ? colors.accent : colors.textSecondary} />
                    ) : (
                      <ArrowIcon direction="left" color={isCurrent ? colors.accent : colors.textSecondary} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: "var(--font-mono)",
                          color: isCurrent ? colors.accent : colors.text,
                          opacity: isCurrent ? 1 : 0.6,
                        }}
                      >
                        {msg.label}
                      </div>
                      {isCurrent && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                            marginTop: 2,
                            lineHeight: 1.4,
                          }}
                        >
                          {msg.detail}
                        </motion.div>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: colors.textSecondary,
                        whiteSpace: "nowrap",
                        opacity: isCurrent ? 1 : 0.4,
                      }}
                    >
                      {msg.durationMs}ms
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })}
      </div>

      {/* Mini terminal preview */}
      <AnimatePresence>
        {currentMessage?.terminalText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: 20,
              borderRadius: 12,
              overflow: "hidden",
              border:  INLINECODE9 ,
            }}
          >
            {/* Terminal title bar */}
            <div
              style={{
                background: isDark ? "#1a1a18" : "#1e1e1c",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#eab308" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "#87867f",
                }}
              >
                终端
              </span>
            </div>
            {/* Terminal body */}
            <div
              style={{
                background: colors.terminalBg,
                padding: "14px 16px",
                minHeight: 80,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: colors.terminalText,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {currentMessage.terminalText}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completion badge */}
      <AnimatePresence>
        {mode === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: 16,
              padding: "14px 20px",
              borderRadius: 12,
              border:  INLINECODE10 ,
              background: colors.accentBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.accent,
                  fontFamily: "var(--font-mono)",
                }}
              >
                黄金路径完成
              </div>
              <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                13 则消息、1 次工具循环叠代、{TOTAL_DURATION} 端对端
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: colors.textSecondary,
                padding: "4px 10px",
                borderRadius: 6,
                background: isDark ? "rgba(217, 119, 87, 0.15)" : "rgba(217, 119, 87, 0.12)",
              }}
            >
              产生器 yield 了 Terminal.Success
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
