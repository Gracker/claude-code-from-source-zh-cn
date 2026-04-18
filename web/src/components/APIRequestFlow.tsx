import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Dark Mode Hook ---

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

// --- Types ---

type Participant = "loop" | "factory" | "api" | "cache";

interface SequenceStep {
  id: number;
  from: Participant;
  to: Participant;
  label: string;
  sublabel?: string;
  description: string;
  highlight?: "cache" | "watchdog" | "error" | "retry";
  tokens?: number;
}

// --- Step Data ---

const normalSteps: SequenceStep[] = [
  {
    id: 1,
    from: "loop",
    to: "factory",
    label: "createStream(messages)",
    description:
      "查询循环发起 API 呼叫，传递完整的消息数组和设置。",
  },
  {
    id: 2,
    from: "factory",
    to: "factory",
    label: "提供者分派",
    sublabel: "Direct / Bedrock / Vertex",
    description:
      "客户端工厂通过环境变量选择提供者。所有四个 SDK 都被转换为统一的 Anthropic 接口。",
  },
  {
    id: 3,
    from: "factory",
    to: "api",
    label: "请求头 + 系统提示",
    sublabel: "beta 请求头、黏性闪锁、cache_control",
    description:
      "Beta 请求头以黏性闪锁组装（一旦设为 true 就永不恢复）。系统提示在动态边界处分割以实现最佳缓存。",
  },
  {
    id: 4,
    from: "api",
    to: "cache",
    label: "缓存前缀检查",
    sublabel: "50-70K token 前缀",
    description:
      "服务器检查稳定的提示前缀是否符合缓存条目。静态区段取得全域范围；动态区段取得每会话范围。",
    highlight: "cache",
  },
  {
    id: 5,
    from: "cache",
    to: "api",
    label: "缓存命中",
    sublabel: "节省了 60K token 约 $0.12",
    description:
      "静态前缀缓存命中。服务器跳过重新处理 50-70K token 的系统提示和早期对话历史。",
    highlight: "cache",
    tokens: 0,
  },
  {
    id: 6,
    from: "api",
    to: "loop",
    label: "SSE 串流开始",
    sublabel: "Raw Stream<BetaRawMessageStreamEvent>",
    description:
      "回应以服务器传送事件串流回来。使用原始 SSE（而非 SDK 的 BetaMessageStream）以避免 O(n²) 的部分 JSON 解析。",
    tokens: 0,
  },
  {
    id: 7,
    from: "loop",
    to: "loop",
    label: "闲置看门狗：90秒",
    sublabel: "每个区块重置",
    description:
      "一个 setTimeout 在每次收到区块时重置。如果 90 秒内没有区块到达，串流会被中断并触发非串流备用。",
    highlight: "watchdog",
    tokens: 847,
  },
  {
    id: 8,
    from: "api",
    to: "loop",
    label: "Token 串流中...",
    sublabel: "content_block_delta 事件",
    description:
      "文字和 tool_use 区块增量到达。串流执行器可以在回应完成之前开始执行并行安全的工具。",
    tokens: 2431,
  },
  {
    id: 9,
    from: "api",
    to: "loop",
    label: "串流完成",
    sublabel: "message_stop 事件",
    description:
      "最后一个 SSE 事件到达。回应被解析为包含文字区块和 tool_use 区块的 AssistantMessage。",
    tokens: 3892,
  },
  {
    id: 10,
    from: "loop",
    to: "loop",
    label: "回应已解析",
    sublabel: "AssistantMessage + tool_use 区块",
    description:
      "循环处理完整的回应：提取工具呼叫、更新状态、检查错误，并为下一次迭代做准备。",
    tokens: 3892,
  },
];

const errorSteps: SequenceStep[] = [
  ...normalSteps.slice(0, 6),
  {
    id: 7,
    from: "api",
    to: "loop",
    label: "529 过载",
    sublabel: "服务器已满载",
    description:
      "API 传回 529 状态。withRetry() 生成器产生一个 SystemAPIErrorMessage，让 UI 可以显示重试状态。",
    highlight: "error",
    tokens: 0,
  },
  {
    id: 8,
    from: "loop",
    to: "loop",
    label: "退避：1秒",
    sublabel: "第 1 次，共 3 次",
    description:
      "指数退避开始。重试进度作为事件串流的自然部分出现，而非旁路通知。",
    highlight: "retry",
    tokens: 0,
  },
  {
    id: 9,
    from: "loop",
    to: "api",
    label: "重试请求",
    sublabel: "相同参数",
    description:
      "以相同参数重新传送请求。在 529 时可选择性降级快速模式。",
    highlight: "retry",
    tokens: 0,
  },
  {
    id: 10,
    from: "api",
    to: "loop",
    label: "再次 529",
    sublabel: "仍然过载",
    description: "第二次失败。退避间隔倍增。",
    highlight: "error",
    tokens: 0,
  },
  {
    id: 11,
    from: "loop",
    to: "loop",
    label: "退避：2秒",
    sublabel: "第 2 次，共 3 次",
    description:
      "更长的等待。生成器产生状态事件，UI 将其渲染为加载指示器。",
    highlight: "retry",
    tokens: 0,
  },
  {
    id: 12,
    from: "loop",
    to: "api",
    label: "重试请求",
    sublabel: "第 3 次",
    description: "最后一次重试。如果这次也失败，将以 4 秒退避。",
    highlight: "retry",
    tokens: 0,
  },
  {
    id: 13,
    from: "api",
    to: "loop",
    label: "200 OK——串流中",
    sublabel: "恢复成功",
    description:
      "请求在重试后成功。正常串流恢复。早前的错误被隐藏不传给消费者。",
    tokens: 3892,
  },
];

// --- Participant Layout ---

const participants: { id: Participant; label: string; short: string }[] = [
  { id: "loop", label: "查询循环", short: "循环" },
  { id: "factory", label: "客户端工厂", short: "工厂" },
  { id: "api", label: "提供者 API", short: "API" },
  { id: "cache", label: "缓存", short: "缓存" },
];

const participantX: Record<Participant, number> = {
  loop: 0,
  factory: 1,
  api: 2,
  cache: 3,
};

// --- Component ---

export default function APIRequestFlow({
  className = "",
}: {
  className?: string;
}) {
  const isDark = useDarkMode();
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulateError, setSimulateError] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [watchdogTime, setWatchdogTime] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const steps = simulateError ? errorSteps : normalSteps;

  const colors = {
    bg: isDark ? "#1e1e1c" : "#ffffff",
    surface: isDark ? "#2a2a28" : "#f5f4ed",
    text: isDark ? "#f5f4ed" : "#141413",
    textMuted: isDark ? "#87867f" : "#87867f",
    border: isDark ? "#444" : "#c2c0b6",
    terracotta: "#d97757",
    green: "#22c55e",
    red: "#ef4444",
    amber: "#eda100",
    blue: isDark ? "#60a5fa" : "#3b82f6",
    cacheBg: isDark
      ? "rgba(34, 197, 94, 0.12)"
      : "rgba(34, 197, 94, 0.08)",
    errorBg: isDark
      ? "rgba(239, 68, 68, 0.12)"
      : "rgba(239, 68, 68, 0.08)",
    retryBg: isDark
      ? "rgba(237, 161, 0, 0.12)"
      : "rgba(237, 161, 0, 0.08)",
    watchdogBg: isDark
      ? "rgba(96, 165, 250, 0.12)"
      : "rgba(59, 130, 246, 0.08)",
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setCurrentStep(-1);
    setIsPlaying(false);
    setTokenCount(0);
    setWatchdogTime(90);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  // Reset when toggling error mode
  useEffect(() => {
    reset();
  }, [simulateError, reset]);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return;

    if (currentStep >= steps.length - 1) {
      setIsPlaying(false);
      return;
    }

    const delay = steps[currentStep + 1]?.highlight === "retry" ? 1500 : 900;
    timerRef.current = setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
    }, delay) as unknown as ReturnType<typeof setInterval>;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentStep, steps]);

  // Update token count and watchdog on step change
  useEffect(() => {
    if (currentStep < 0) return;
    const step = steps[currentStep];
    if (step?.tokens !== undefined) {
      setTokenCount(step.tokens);
    }

    // Reset watchdog on streaming steps
    if (step?.highlight === "watchdog") {
      setWatchdogTime(90);
      // Start countdown
      watchdogRef.current = setInterval(() => {
        setWatchdogTime((prev) => {
          if (prev <= 0) {
            if (watchdogRef.current) clearInterval(watchdogRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 50) as ReturnType<typeof setInterval>;
    } else if (
      step?.from === "api" &&
      step?.to === "loop" &&
      !step?.highlight
    ) {
      // Reset watchdog on normal chunks
      setWatchdogTime(90);
    }
  }, [currentStep, steps]);

  const stepForward = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const play = () => {
    if (currentStep >= steps.length - 1) {
      reset();
      setTimeout(() => {
        setIsPlaying(true);
        setCurrentStep(0);
      }, 100);
    } else {
      setIsPlaying(true);
      if (currentStep < 0) setCurrentStep(0);
    }
  };

  const highlightColor = (h?: string) => {
    switch (h) {
      case "cache":
        return colors.green;
      case "watchdog":
        return colors.blue;
      case "error":
        return colors.red;
      case "retry":
        return colors.amber;
      default:
        return colors.terracotta;
    }
  };

  const highlightBg = (h?: string) => {
    switch (h) {
      case "cache":
        return colors.cacheBg;
      case "error":
        return colors.errorBg;
      case "retry":
        return colors.retryBg;
      case "watchdog":
        return colors.watchdogBg;
      default:
        return "transparent";
    }
  };

  // Compute column width based on container
  const colWidth = 160;
  const diagramWidth = colWidth * 4;

  return (
    <div
      className={className}
      style={{
        fontFamily: "var(--font-serif)",
        color: colors.text,
        maxWidth: 860,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 600,
            margin: "0 0 6px 0",
            color: colors.text,
          }}
        >
          API 请求 / 回应生命周期
        </h3>
        <p
          style={{
            fontSize: 14,
            color: colors.textMuted,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          从查询循环追踪一次 API 呼叫，经过提供者选择、缓存、串流和错误复原。
        </p>
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={isPlaying ? () => setIsPlaying(false) : play}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: colors.terracotta,
            color: "#fff",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {isPlaying
            ? "\u23F8 暂停"
            : currentStep >= steps.length - 1
              ? "\u21BB 重播"
              : "\u25B6 播放"}
        </button>

        <button
          onClick={stepForward}
          disabled={isPlaying || currentStep >= steps.length - 1}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            color:
              isPlaying || currentStep >= steps.length - 1
                ? colors.textMuted
                : colors.text,
            cursor:
              isPlaying || currentStep >= steps.length - 1
                ? "not-allowed"
                : "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
        >
          单步 \u25B6\u258F
        </button>

        <button
          onClick={reset}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border:  INLINECODE1 ,
            background: colors.surface,
            color: colors.text,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
        >
          重置
        </button>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: colors.textMuted,
            cursor: "pointer",
            marginLeft: 4,
          }}
        >
          <input
            type="checkbox"
            checked={simulateError}
            onChange={(e) => setSimulateError(e.target.checked)}
            style={{ accentColor: colors.red }}
          />
          模拟 529 错误
        </label>
      </div>

      {/* Status Bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        {/* Token Counter */}
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: colors.surface,
            border:  INLINECODE2 ,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: colors.textMuted }}>Token：</span>
          <motion.span
            key={tokenCount}
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{ fontWeight: 700, color: colors.terracotta }}
          >
            {tokenCount.toLocaleString()}
          </motion.span>
        </div>

        {/* Watchdog Timer */}
        {currentStep >= 0 && (
          <div
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: colors.watchdogBg,
              border:  INLINECODE3 ,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: colors.blue }}>看门狗：</span>
            <span
              style={{
                fontWeight: 700,
                color: watchdogTime < 30 ? colors.amber : colors.blue,
              }}
            >
              {watchdogTime}s
            </span>
          </div>
        )}

        {/* Cache Savings */}
        {currentStep >= 4 &&
          steps[Math.min(currentStep, steps.length - 1)]?.highlight ===
            "cache" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: colors.cacheBg,
                border:  INLINECODE4 ,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: colors.green,
                fontWeight: 600,
              }}
            >
              $ 缓存节省了约 60K token
            </motion.div>
          )}

        {/* Step counter */}
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: colors.surface,
            border:  INLINECODE5 ,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: colors.textMuted,
            marginLeft: "auto",
          }}
        >
          {currentStep + 1} / {steps.length}
        </div>
      </div>

      {/* Sequence Diagram */}
      <div
        style={{
          border:  INLINECODE6 ,
          borderRadius: 12,
          overflow: "hidden",
          background: colors.surface,
        }}
      >
        {/* Participant Headers */}
        <div
          style={{
            display: "flex",
            borderBottom:  INLINECODE7 ,
            background: isDark ? "#252523" : "#eae9e1",
          }}
        >
          {participants.map((p) => (
            <div
              key={p.id}
              style={{
                flex: 1,
                padding: "10px 8px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                color: colors.text,
              }}
            >
              <span className="hidden sm:inline">{p.label}</span>
              <span className="sm:hidden">{p.short}</span>
            </div>
          ))}
        </div>

        {/* Lifelines + Steps */}
        <div style={{ position: "relative", minHeight: 60 }}>
          {/* Vertical lifelines */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              pointerEvents: "none",
            }}
          >
            {participants.map((p) => (
              <div
                key={p.id}
                style={{
                  flex: 1,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 1,
                    height: "100%",
                    background: colors.border,
                    opacity: 0.4,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Step rows */}
          <AnimatePresence>
            {steps.map((step, idx) => {
              if (idx > currentStep) return null;

              const fromX = participantX[step.from];
              const toX = participantX[step.to];
              const isSelf = fromX === toX;
              const leftCol = Math.min(fromX, toX);
              const rightCol = Math.max(fromX, toX);
              const goingRight = toX >= fromX;

              return (
                <motion.div
                  key={ INLINECODE8 }
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: "relative",
                    padding: "10px 12px",
                    borderBottom:  INLINECODE9 ,
                    background:
                      idx === currentStep
                        ? highlightBg(step.highlight)
                        : "transparent",
                  }}
                >
                  {/* Arrow visualization */}
                  <div
                    style={{
                      display: "flex",
                      position: "relative",
                      height: 24,
                      marginBottom: 4,
                    }}
                  >
                    {participants.map((p, pIdx) => {
                      const isFrom = pIdx === fromX;
                      const isTo = pIdx === toX;
                      const isBetween =
                        !isSelf && pIdx > leftCol && pIdx < rightCol;
                      const isEndpoint = isFrom || isTo;

                      return (
                        <div
                          key={p.id}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {/* Dot at endpoints */}
                          {isEndpoint && (
                            <motion.div
                              initial={
                                idx === currentStep ? { scale: 0 } : undefined
                              }
                              animate={{ scale: 1 }}
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: highlightColor(step.highlight),
                                zIndex: 2,
                              }}
                            />
                          )}

                          {/* Self-arrow (loop) */}
                          {isSelf && isFrom && (
                            <motion.div
                              initial={
                                idx === currentStep
                                  ? { scaleX: 0 }
                                  : undefined
                              }
                              animate={{ scaleX: 1 }}
                              style={{
                                position: "absolute",
                                right: -8,
                                top: -2,
                                width: 28,
                                height: 28,
                                border:  INLINECODE10 ,
                                borderRadius: "0 12px 12px 0",
                                borderLeft: "none",
                                transformOrigin: "left center",
                              }}
                            />
                          )}

                          {/* Line between endpoints */}
                          {isBetween && (
                            <motion.div
                              initial={
                                idx === currentStep
                                  ? { scaleX: 0 }
                                  : undefined
                              }
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3 }}
                              style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                height: 2,
                                background: highlightColor(step.highlight),
                                transformOrigin: goingRight
                                  ? "left center"
                                  : "right center",
                              }}
                            />
                          )}

                          {/* Line from 'from' to next */}
                          {isFrom && !isSelf && (
                            <motion.div
                              initial={
                                idx === currentStep
                                  ? { scaleX: 0 }
                                  : undefined
                              }
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3 }}
                              style={{
                                position: "absolute",
                                [goingRight ? "left" : "right"]: "50%",
                                [goingRight ? "right" : "left"]: 0,
                                height: 2,
                                background: highlightColor(step.highlight),
                                transformOrigin: goingRight
                                  ? "left center"
                                  : "right center",
                              }}
                            />
                          )}

                          {/* Line to 'to' from previous */}
                          {isTo && !isSelf && (
                            <motion.div
                              initial={
                                idx === currentStep
                                  ? { scaleX: 0 }
                                  : undefined
                              }
                              animate={{ scaleX: 1 }}
                              transition={{ duration: 0.3 }}
                              style={{
                                position: "absolute",
                                [goingRight ? "right" : "left"]: "50%",
                                [goingRight ? "left" : "right"]: 0,
                                height: 2,
                                background: highlightColor(step.highlight),
                                transformOrigin: goingRight
                                  ? "right center"
                                  : "left center",
                              }}
                            />
                          )}

                          {/* Arrowhead at 'to' */}
                          {isTo && !isSelf && (
                            <motion.div
                              initial={
                                idx === currentStep
                                  ? { opacity: 0, scale: 0 }
                                  : undefined
                              }
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.2 }}
                              style={{
                                position: "absolute",
                                [goingRight ? "left" : "right"]: "calc(50% - 6px)",
                                width: 0,
                                height: 0,
                                borderTop: "5px solid transparent",
                                borderBottom: "5px solid transparent",
                                [goingRight
                                  ? "borderLeft"
                                  : "borderRight"]:  INLINECODE11 ,
                                zIndex: 3,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Label */}
                  <div
                    style={{
                      textAlign: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          idx === currentStep
                            ? highlightColor(step.highlight)
                            : colors.text,
                      }}
                    >
                      {step.label}
                    </span>
                    {step.sublabel && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: colors.textMuted,
                          marginTop: 1,
                        }}
                      >
                        {step.sublabel}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {currentStep < 0 && (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              按下播放或单步开始 API 呼叫序列。
            </div>
          )}
        </div>
      </div>

      {/* Current Step Detail */}
      <AnimatePresence mode="wait">
        {currentStep >= 0 && currentStep < steps.length && (
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{
              marginTop: 16,
              padding: "14px 18px",
              borderRadius: 8,
              background: colors.surface,
              border:  INLINECODE12 ,
              fontSize: 13,
              lineHeight: 1.6,
              color: colors.textMuted,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 600,
                color: highlightColor(steps[currentStep].highlight),
                marginBottom: 4,
              }}
            >
              步骤 {currentStep + 1}: {steps[currentStep].label}
            </div>
            {steps[currentStep].description}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
