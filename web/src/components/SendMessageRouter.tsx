import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

type RouteType =
  | "bridge"
  | "uds"
  | "registry_running"
  | "registry_terminal"
  | "mailbox"
  | "error";

interface RouteStep {
  id: string;
  label: string;
  check: string;
  detail: string;
}

interface Preset {
  name: string;
  description: string;
  resolvedRoute: RouteType;
  rawTo: string;
}

interface RoutingResult {
  route: RouteType;
  label: string;
  detail: string;
  color: string;
}

// --- Data ---

const routeSteps: RouteStep[] = [
  {
    id: "bridge",
    label: "Bridge Transport",
    check: '以 "bridge:" 开头？',
    detail:
      "通过 Remote Control 中继进行跨机器通讯。两个位于不同机器的 Claude Code 实例通过 Anthropic 服务器通讯。需要使用者明确同意。",
  },
  {
    id: "uds",
    label: "UDS Socket",
    check: '以 "uds:" 开头？',
    detail:
      "通过 Unix Domain Sockets 进行本地进程间通讯。适用于同一机器上不同进程的实例（例如 VS Code 扩充功能 + 终端）。快速、安全、可靠。",
  },
  {
    id: "registry_running",
    label: "进程内（执行中）",
    check: "在 agentNameRegistry 中找到且执行中？",
    detail:
      "最常见的路径。消息通过 pendingMessages 数组排入队列，在下一个工具回合边界时传递。保持回合结构——不会产生竞争条件。",
  },
  {
    id: "registry_terminal",
    label: "恢复已结束的代理",
    check: "找到但处于终止状态？",
    detail:
      "自动恢复：从磁碟转录重建代理，重建消息历史，重新注册为背景任务。协调者永远不需要追踪代理的存活状态。",
  },
  {
    id: "mailbox",
    label: "团队信箱",
    check: "团队上下文已启用？",
    detail:
      '基于文件的信箱系统。消息写入收件者的信箱文件到磁碟中。支持通过 "*" 万用字符进行广播。上限：50 则消息用于 UI 显示。',
  },
  {
    id: "error",
    label: "错误",
    check: "预设落入",
    detail: "在任何路由表中找不到收件者。向发送者返回错误。",
  },
];

const routeResults: Record<RouteType, RoutingResult> = {
  bridge: {
    route: "bridge",
    label: "Bridge 中继",
    detail: "通过 Remote Control 服务器传递（跨机器）",
    color: "#6b8dd6",
  },
  uds: {
    route: "uds",
    label: "UDS Socket",
    detail: "通过 Unix Domain Socket 传递（本地进程间）",
    color: "#6b8dd6",
  },
  registry_running: {
    route: "registry_running",
    label: "已排入队列",
    detail: "在 pendingMessages 中排入队列，于工具回合边界时传递",
    color: "#4ade80",
  },
  registry_terminal: {
    route: "registry_terminal",
    label: "已恢复",
    detail: "代理从磁碟转录中复活，包含完整历史记录",
    color: "#f59e0b",
  },
  mailbox: {
    route: "mailbox",
    label: "信箱",
    detail: "写入基于文件的信箱以非同步传递",
    color: "#4ade80",
  },
  error: {
    route: "error",
    label: "错误",
    detail: "在任何路由表中找不到收件者",
    color: "#ef4444",
  },
};

const presets: Preset[] = [
  {
    name: "bridge:remote-session-1",
    description: "跨机器的远端会话",
    resolvedRoute: "bridge",
    rawTo: "bridge:remote-session-1",
  },
  {
    name: "uds:/tmp/claude.sock",
    description: "VS Code 扩充功能 socket",
    resolvedRoute: "uds",
    rawTo: "uds:/tmp/claude.sock",
  },
  {
    name: "researcher",
    description: "执行中的背景代理",
    resolvedRoute: "registry_running",
    rawTo: "researcher",
  },
  {
    name: "explorer-agent",
    description: "已完成的代理（将恢复）",
    resolvedRoute: "registry_terminal",
    rawTo: "explorer-agent",
  },
  {
    name: "background-worker",
    description: "具有信箱的群集队友",
    resolvedRoute: "mailbox",
    rawTo: "background-worker",
  },
  {
    name: "nonexistent-agent",
    description: "未知收件者",
    resolvedRoute: "error",
    rawTo: "nonexistent-agent",
  },
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

function getRouteForInput(input: string): RouteType {
  const trimmed = input.trim();
  if (!trimmed) return "error";
  const preset = presets.find(
    (p) => p.rawTo.toLowerCase() === trimmed.toLowerCase()
  );
  if (preset) return preset.resolvedRoute;
  if (trimmed.startsWith("bridge:")) return "bridge";
  if (trimmed.startsWith("uds:")) return "uds";
  return "error";
}

function getStepIndex(route: RouteType): number {
  const map: Record<RouteType, number> = {
    bridge: 0,
    uds: 1,
    registry_running: 2,
    registry_terminal: 3,
    mailbox: 4,
    error: 5,
  };
  return map[route];
}

// --- Component ---

interface Props {
  className?: string;
}

export default function SendMessageRouter({ className }: Props) {
  const isDark = useDarkMode();
  const [recipientInput, setRecipientInput] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [currentCheckIndex, setCurrentCheckIndex] = useState(-1);
  const [matchedRoute, setMatchedRoute] = useState<RouteType | null>(null);
  const [mailboxCount, setMailboxCount] = useState(0);
  const animatingRef = useRef(false);

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
    inputBg: isDark ? "#2a2a28" : "#f5f4ed",
    connectorLine: isDark ? "#444" : "#c2c0b6",
    stepBg: isDark ? "#252523" : "#fafaf7",
    stepActiveBg: isDark
      ? "rgba(217, 119, 87, 0.12)"
      : "rgba(217, 119, 87, 0.06)",
    stepPassedBg: isDark
      ? "rgba(135, 134, 127, 0.08)"
      : "rgba(135, 134, 127, 0.05)",
  };

  const routeMessage = useCallback(() => {
    if (animatingRef.current || !recipientInput.trim()) return;
    animatingRef.current = true;
    setIsRouting(true);
    setMatchedRoute(null);
    setCurrentCheckIndex(-1);

    const route = getRouteForInput(recipientInput);
    const targetIndex = getStepIndex(route);

    let step = 0;
    const interval = setInterval(() => {
      setCurrentCheckIndex(step);
      if (step === targetIndex) {
        clearInterval(interval);
        setTimeout(() => {
          setMatchedRoute(route);
          if (route === "mailbox") {
            setMailboxCount((c) => Math.min(c + 1, 50));
          }
          setTimeout(() => {
            setIsRouting(false);
            animatingRef.current = false;
          }, 1200);
        }, 400);
      }
      step++;
    }, 350);
  }, [recipientInput]);

  const selectPreset = useCallback(
    (preset: Preset) => {
      if (animatingRef.current) return;
      setRecipientInput(preset.rawTo);
      setMatchedRoute(null);
      setCurrentCheckIndex(-1);
    },
    []
  );

  const reset = useCallback(() => {
    setRecipientInput("");
    setIsRouting(false);
    setCurrentCheckIndex(-1);
    setMatchedRoute(null);
    setMailboxCount(0);
    animatingRef.current = false;
  }, []);

  return (
    <div className={className} style={{ fontFamily: "var(--font-serif)" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 24px",
          background: colors.cardBg,
          border:  INLINECODE0 ,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
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
            SendMessage 路由分派
          </span>
          <span
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              marginLeft: "auto",
            }}
          >
            第 10 章 -- 协调机制
          </span>
        </div>

        {/* Input area */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: colors.textSecondary,
              }}
            >
              to:
            </span>
            <input
              type="text"
              value={recipientInput}
              onChange={(e) => {
                setRecipientInput(e.target.value);
                setMatchedRoute(null);
                setCurrentCheckIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") routeMessage();
              }}
              placeholder="收件者名称或位址..."
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                background: colors.inputBg,
                color: colors.text,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: 8,
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={routeMessage}
            disabled={isRouting || !recipientInput.trim()}
            style={{
              padding: "10px 20px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 600,
              background: isRouting ? colors.textSecondary : colors.terracotta,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor:
                isRouting || !recipientInput.trim()
                  ? "not-allowed"
                  : "pointer",
              opacity: isRouting || !recipientInput.trim() ? 0.5 : 1,
              transition: "opacity 0.2s, background 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {isRouting ? "路由中..." : "路由消息"}
          </button>
          {(matchedRoute || currentCheckIndex >= 0) && (
            <button
              onClick={reset}
              style={{
                padding: "10px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                background: "transparent",
                color: colors.textSecondary,
                border:  INLINECODE2 ,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              重设
            </button>
          )}
        </div>

        {/* Presets */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {presets.map((preset) => (
            <button
              key={preset.rawTo}
              onClick={() => selectPreset(preset)}
              style={{
                padding: "5px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background:
                  recipientInput === preset.rawTo
                    ? colors.terracottaBg
                    : colors.stepBg,
                color:
                  recipientInput === preset.rawTo
                    ? colors.terracotta
                    : colors.textSecondary,
                border: `1px solid ${
                  recipientInput === preset.rawTo
                    ? colors.terracotta
                    : colors.cardBorder
                }`,
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Routing Pipeline */}
      <div
        style={{
          padding: "20px 24px",
          background: colors.cardBg,
          border:  INLINECODE4 ,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            marginBottom: 14,
            fontFamily: "var(--font-mono)",
          }}
        >
          优先顺序分派炼
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {routeSteps.map((step, index) => {
            const isChecking = currentCheckIndex === index && !matchedRoute;
            const isPassed =
              currentCheckIndex > index ||
              (matchedRoute !== null && getStepIndex(matchedRoute) > index);
            const isMatched =
              matchedRoute !== null &&
              getStepIndex(matchedRoute) === index;
            const isNotReached =
              currentCheckIndex < index && !matchedRoute;

            let stepBg = colors.stepBg;
            let borderColor = colors.cardBorder;
            let indicatorColor = colors.textSecondary;

            if (isChecking) {
              stepBg = colors.stepActiveBg;
              borderColor = colors.terracotta;
              indicatorColor = colors.terracotta;
            } else if (isMatched) {
              stepBg = isDark
                ? "rgba(217, 119, 87, 0.18)"
                : "rgba(217, 119, 87, 0.1)";
              borderColor = colors.terracotta;
              indicatorColor = colors.terracotta;
            } else if (isPassed) {
              stepBg = colors.stepPassedBg;
              indicatorColor = colors.textSecondary;
            }

            return (
              <div key={step.id}>
                {/* Connector line */}
                {index > 0 && (
                  <div
                    style={{
                      width: 2,
                      height: 8,
                      marginLeft: 19,
                      background:
                        isPassed || isChecking || isMatched
                          ? colors.terracotta
                          : colors.connectorLine,
                      transition: "background 0.3s",
                    }}
                  />
                )}

                <motion.div
                  animate={{
                    backgroundColor: stepBg,
                    borderColor: borderColor,
                  }}
                  transition={{ duration: 0.3 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 16px",
                    borderRadius: 8,
                    border:  INLINECODE5 ,
                    background: stepBg,
                    opacity: isNotReached && currentCheckIndex >= 0 ? 0.4 : 1,
                    transition: "opacity 0.3s",
                  }}
                >
                  {/* Step number indicator */}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      flexShrink: 0,
                      background: isMatched
                        ? colors.terracotta
                        : isChecking
                        ? colors.terracottaBg
                        : "transparent",
                      color: isMatched
                        ? "#fff"
                        : indicatorColor,
                      border:  INLINECODE6 ,
                      transition: "all 0.3s",
                    }}
                  >
                    {isMatched ? (
                      <svg width="12" height="12" viewBox="0 0 12 12">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="#fff"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : isPassed ? (
                      <svg width="10" height="10" viewBox="0 0 10 10">
                        <line
                          x1="2"
                          y1="5"
                          x2="8"
                          y2="5"
                          stroke={colors.textSecondary}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 13,
                          fontWeight: 600,
                          color: isMatched
                            ? colors.terracotta
                            : isChecking
                            ? colors.terracotta
                            : colors.text,
                          transition: "color 0.3s",
                        }}
                      >
                        {step.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: colors.textSecondary,
                        }}
                      >
                        {step.check}
                      </span>
                    </div>

                    <AnimatePresence>
                      {(isChecking || isMatched) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                            lineHeight: 1.5,
                            overflow: "hidden",
                          }}
                        >
                          {step.detail}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Checking spinner */}
                  {isChecking && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border:  INLINECODE7 ,
                        borderTopColor: colors.terracotta,
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {/* Matched badge */}
                  <AnimatePresence>
                    {isMatched && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        style={{
                          padding: "4px 10px",
                          background: colors.terracotta,
                          color: "#fff",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 6,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        已传递！
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Result + Mailbox Counter */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Result card */}
        <AnimatePresence>
          {matchedRoute && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                flex: "1 1 300px",
                padding: "16px 20px",
                background: colors.cardBg,
                border:  INLINECODE8 ,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: routeResults[matchedRoute].color,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: routeResults[matchedRoute].color,
                  }}
                >
                  {routeResults[matchedRoute].label}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {routeResults[matchedRoute].detail}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mailbox counter */}
        <div
          style={{
            flex: "0 0 auto",
            minWidth: 180,
            padding: "16px 20px",
            background: colors.cardBg,
            border:  INLINECODE9 ,
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: colors.textSecondary,
              marginBottom: 6,
            }}
          >
            信箱消息
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
            }}
          >
            <motion.span
              key={mailboxCount}
              initial={{ scale: 1.3, color: colors.terracotta }}
              animate={{ scale: 1, color: colors.text }}
              transition={{ duration: 0.3 }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 700,
                color: colors.text,
              }}
            >
              {mailboxCount}
            </motion.span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              / 50
            </span>
          </div>
          {/* Mini progress bar */}
          <div
            style={{
              width: "100%",
              height: 4,
              background: colors.stepBg,
              borderRadius: 2,
              marginTop: 8,
              overflow: "hidden",
            }}
          >
            <motion.div
              animate={{ width:  INLINECODE10  }}
              transition={{ duration: 0.3 }}
              style={{
                height: "100%",
                background:
                  mailboxCount >= 45
                    ? "#ef4444"
                    : mailboxCount >= 30
                    ? "#f59e0b"
                    : colors.terracotta,
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: colors.textSecondary,
              marginTop: 4,
            }}
          >
            UI 消息上限
          </div>
        </div>
      </div>
    </div>
  );
}
