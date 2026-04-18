import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

type View = "grid" | "decision" | "oauth";

interface TransportType {
  id: string;
  name: string;
  category: string;
  categoryColor: string;
  description: string;
  howItWorks: string;
  whenToUse: string;
  connectionFlow: string[];
}

interface DecisionNode {
  id: string;
  question: string;
  options: { label: string; next: string }[];
  result?: string;
  resultTransport?: string;
}

interface OAuthStep {
  id: number;
  title: string;
  description: string;
  detail: string;
}

// --- Data ---

const transports: TransportType[] = [
  {
    id: "stdio",
    name: "stdio",
    category: "Local",
    categoryColor: "#4ade80",
    description: "使用 stdin/stdout 的 JSON-RPC 子进程。未指定 type 时的预设值。",
    howItWorks: "Claude Code 产生一个子进程。JSON-RPC 消息通过 stdin（用户端到服务器）和 stdout（服务器到用户端）进行管道传递。无网络，无认证。",
    whenToUse: "本机工具：文件系统存取、数据库查询、自订脚本。最常见的传输层。",
    connectionFlow: ["产生子进程", "管道 stdin/stdout", "传送 tools/list", "就绪"],
  },
  {
    id: "sse",
    name: "SSE (Server-Sent Events)",
    category: "Remote",
    categoryColor: "#60a5fa",
    description: "与旧 HTTP 传输层。用户端通过 POST 传送请求，服务器通过 SSE 串流推送回应。",
    howItWorks: "用户端建立 SSE 连线接收服务器到用户端的消息。用户端到服务器的消息通过 HTTP POST 传送。广泛部署但正被取代。",
    whenToUse: "2025 年之前部署的与旧 MCP 服务器。在生态系中仍然常见。",
    connectionFlow: ["HTTP GET /sse", "建立 SSE 串流", "POST 请求", "SSE 回应"],
  },
  {
    id: "http",
    name: "Streamable HTTP",
    category: "Remote",
    categoryColor: "#60a5fa",
    description: "当前规格建议。POST 搭配可选的 SSE 用于串流回应。",
    howItWorks: "用户端通过 HTTP POST 传送 JSON-RPC。服务器可以以 JSON（简单）或升级为 SSE 串流（串流）回应。通过会话 ID 实现双向通讯。",
    whenToUse: "新的远端 MCP 服务器。当前规格建议。",
    connectionFlow: ["POST /mcp", "回应：JSON 或 SSE", "追踪会话 ID", "-32001 时重试"],
  },
  {
    id: "ws",
    name: "WebSocket",
    category: "Remote",
    categoryColor: "#60a5fa",
    description: "全双工双向通讯。实务中较少见。",
    howItWorks: "标准 WebSocket 连线。JSON-RPC 消息在两个方向流动。Bun 和 Node 有不同的 WebSocket API — 需要执行环境分支。",
    whenToUse: "当需要服务器主动发起的双向通讯时。除了 IDE 整合外很少见。",
    connectionFlow: ["WS 握手", "双向通道", "JSON-RPC 双向", "断开时关闭"],
  },
  {
    id: "sdk",
    name: "SDK Transport",
    category: "In-Process",
    categoryColor: "#a78bfa",
    description: "通过 stdin/stdout 传递控制消息，用于 SDK 嵌入情境。",
    howItWorks: "当 Claude Code 通过 SDK 作为子进程执行时使用。控制消息（MCP 请求）与代理通讯共用相同的 stdin/stdout 进行多工传输。",
    whenToUse: "当通过官方 SDK 在 Claude Code 之上构建时。",
    connectionFlow: ["SDK 产生 Claude Code", "多工控制消息", "MCP 通过 stdin/stdout", "共享通道"],
  },
  {
    id: "sse-ide",
    name: "IDE stdio",
    category: "IDE",
    categoryColor: "#f472b6",
    description: "VS Code 或 JetBrains 扩充包通过 stdio 通道通讯。",
    howItWorks: "IDE 扩充包通过其扩充 API 提供 MCP 服务器。通讯使用 IDE 内置的 stdio 通道而非网络。",
    whenToUse: "通过 IDE 原生通道暴露 MCP 工具的 VS Code 扩充包。",
    connectionFlow: ["IDE 扩充加载", "开启 stdio 通道", "MCP 握手", "工具可用"],
  },
  {
    id: "ws-ide",
    name: "IDE WebSocket",
    category: "IDE",
    categoryColor: "#f472b6",
    description: "IDE 通过 WebSocket 的远端连线。具有执行环境差异（Bun vs Node）。",
    howItWorks: "通过 WebSocket 连接到远端执行的 IDE 扩充包。Bun 的 WebSocket 原生支持 proxy/TLS；Node 需要 ws 包。",
    whenToUse: "远端 IDE 连线（例如 JetBrains Gateway、VS Code Remote）。",
    connectionFlow: ["WS 连接 IDE", "执行环境侦测", "Bun 原生 / Node ws", "MCP 就绪"],
  },
  {
    id: "inprocess",
    name: "In-Process",
    category: "In-Process",
    categoryColor: "#a78bfa",
    description: "链接传输层配对。直接函数调用。总共 63 行。",
    howItWorks: "两个 InProcessTransport 实例作为对等端链接。send() 通过 queueMicrotask() 传递以避免堪叠深度问题。close() 会级联到对等端。",
    whenToUse: "同进程 MCP 服务器：Chrome MCP、Computer Use MCP。零网络开销。",
    connectionFlow: ["建立链接配对", "queueMicrotask 传递", "直接函数调用", "级联关闭"],
  },
];

const decisionTree: DecisionNode[] = [
  {
    id: "start",
    question: "你的 MCP 服务器在哪里？",
    options: [
      { label: "同一台机器（本机进程）", next: "local" },
      { label: "远端服务（HTTP/WS）", next: "remote" },
      { label: "同一进程（嵌入式）", next: "inprocess" },
      { label: "IDE 扩充包", next: "ide" },
    ],
  },
  {
    id: "local",
    question: "",
    options: [],
    result: "使用 stdio — 无网络、无认证，只有管道。预设且最常见的传输层。",
    resultTransport: "stdio",
  },
  {
    id: "remote",
    question: "服务器需要串流回应吗？",
    options: [
      { label: "是，需要串流", next: "remote-stream" },
      { label: "不，简单的请求/回应", next: "remote-simple" },
      { label: "需要完整双向通讯", next: "remote-bidi" },
    ],
  },
  {
    id: "remote-stream",
    question: "服务器是 2025 年之前的与旧部署吗？",
    options: [
      { label: "是，与旧服务器", next: "remote-legacy" },
      { label: "不，新服务器", next: "remote-new" },
    ],
  },
  {
    id: "remote-legacy",
    question: "",
    options: [],
    result: "使用 SSE — 与旧但广泛部署。服务器通过 Server-Sent Events 推送回应。",
    resultTransport: "sse",
  },
  {
    id: "remote-new",
    question: "",
    options: [],
    result: "使用 Streamable HTTP — 当前规格建议。POST 搭配可选的 SSE 升级。",
    resultTransport: "http",
  },
  {
    id: "remote-simple",
    question: "",
    options: [],
    result: "使用 Streamable HTTP — 也适用于简单的 JSON 回应。远端的规格预设。",
    resultTransport: "http",
  },
  {
    id: "remote-bidi",
    question: "",
    options: [],
    result: "使用 WebSocket — 全双工双向。注意：Bun/Node 执行环境对 ws 包有分支。",
    resultTransport: "ws",
  },
  {
    id: "inprocess",
    question: "服务器是用 MCP SDK 构建的吗？",
    options: [
      { label: "是，基于 SDK", next: "inprocess-sdk" },
      { label: "不，同进程中的自订服务器", next: "inprocess-linked" },
    ],
  },
  {
    id: "inprocess-sdk",
    question: "",
    options: [],
    result: "使用 SDK 传输层 — 在现有的 stdin/stdout 通道上多工传输 MCP。",
    resultTransport: "sdk",
  },
  {
    id: "inprocess-linked",
    question: "",
    options: [],
    result: "使用 InProcessTransport — 以 queueMicrotask 传递的链接配对。仅 63 行。",
    resultTransport: "inprocess",
  },
  {
    id: "ide",
    question: "IDE 是本机还是远端？",
    options: [
      { label: "本机 IDE（VS Code、JetBrains）", next: "ide-local" },
      { label: "远端 IDE（Gateway、Remote SSH）", next: "ide-remote" },
    ],
  },
  {
    id: "ide-local",
    question: "",
    options: [],
    result: "使用 IDE stdio — 通过 IDE 内置的扩充通道通讯。",
    resultTransport: "sse-ide",
  },
  {
    id: "ide-remote",
    question: "",
    options: [],
    result: "使用 IDE WebSocket — 远端连接。处理 Bun/Node 执行环境差异。",
    resultTransport: "ws-ide",
  },
];

const oauthSteps: OAuthStep[] = [
  {
    id: 1,
    title: "服务器返回 401",
    description: "MCP 服务器要求认证",
    detail: "对 MCP 服务器的初始请求返回 HTTP 401 Unauthorized。这会触发 OAuth 探索链。",
  },
  {
    id: 2,
    title: "RFC 9728 探索",
    description: "探测 /.well-known/oauth-protected-resource",
    detail: "对服务器的 well-known 端点发送 GET 请求。若找到，撷取 authorization_servers[0] 并对该 URL 执行 RFC 8414 探索。",
  },
  {
    id: 3,
    title: "RFC 8414 元数据",
    description: "探索授权服务器元数据",
    detail: "获取 OpenID/OAuth 元数据文件。包含：token_endpoint、authorization_endpoint、支持的 scope、PKCE 要求。若找不到则回退到路径感知探测。",
  },
  {
    id: 4,
    title: "OAuth 2.0 + PKCE 流程",
    description: "基于浏览器的授权，搭配代码验证器",
    detail: "PKCE（Proof Key for Code Exchange）防止授权码被拦截。产生 code_verifier，计算 code_challenge，将使用者导向授权页面，交换代码取得 token。",
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

// --- Component ---

interface Props {
  className?: string;
}

export default function MCPTransports({ className }: Props) {
  const isDark = useDarkMode();
  const [view, setView] = useState<View>("grid");
  const [selectedTransport, setSelectedTransport] = useState<string | null>(null);
  const [decisionPath, setDecisionPath] = useState<string[]>(["start"]);
  const [activeOAuthStep, setActiveOAuthStep] = useState<number | null>(null);

  const colors = {
    accent: "#d97757",
    accentBg: isDark ? "rgba(217, 119, 87, 0.08)" : "rgba(217, 119, 87, 0.05)",
    accentBorder: "rgba(217, 119, 87, 0.5)",
    text: isDark ? "#f5f4ed" : "#141413",
    textSecondary: "#87867f",
    cardBg: isDark ? "#1e1e1c" : "#ffffff",
    cardBorder: isDark ? "#333" : "#e8e6dc",
    surfaceBg: isDark ? "#30302e" : "#f5f4ed",
    green: "#4ade80",
    greenBg: isDark ? "rgba(74, 222, 128, 0.1)" : "rgba(74, 222, 128, 0.08)",
  };

  const currentDecisionNode = decisionTree.find(
    (n) => n.id === decisionPath[decisionPath.length - 1]
  );

  const advanceDecision = useCallback(
    (nextId: string) => {
      setDecisionPath((prev) => [...prev, nextId]);
    },
    []
  );

  const resetDecision = useCallback(() => {
    setDecisionPath(["start"]);
  }, []);

  const goBackDecision = useCallback(() => {
    setDecisionPath((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  return (
    <div className={className} style={{ fontFamily: "var(--font-serif)" }}>
      {/* View tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          borderBottom:  INLINECODE0 ,
        }}
      >
        {([
          { id: "grid" as View, label: "8 种传输层" },
          { id: "decision" as View, label: "该用哪一种？" },
          { id: "oauth" as View, label: "OAuth 探索" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              padding: "12px 20px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              background: "none",
              border: "none",
              borderBottom:
                view === tab.id
                  ? `2px solid ${colors.accent}`
                  : "2px solid transparent",
              color: view === tab.id ? colors.accent : colors.textSecondary,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <TransportGrid
              colors={colors}
              isDark={isDark}
              selectedTransport={selectedTransport}
              setSelectedTransport={setSelectedTransport}
            />
          </motion.div>
        )}
        {view === "decision" && (
          <motion.div
            key="decision"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <DecisionTree
              colors={colors}
              isDark={isDark}
              currentNode={currentDecisionNode!}
              path={decisionPath}
              onAdvance={advanceDecision}
              onReset={resetDecision}
              onBack={goBackDecision}
            />
          </motion.div>
        )}
        {view === "oauth" && (
          <motion.div
            key="oauth"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <OAuthFlow
              colors={colors}
              isDark={isDark}
              activeStep={activeOAuthStep}
              setActiveStep={setActiveOAuthStep}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Transport Grid ---

function TransportGrid({
  colors,
  isDark,
  selectedTransport,
  setSelectedTransport,
}: {
  colors: Record<string, string>;
  isDark: boolean;
  selectedTransport: string | null;
  setSelectedTransport: (id: string | null) => void;
}) {
  const categories = ["Local", "Remote", "In-Process", "IDE"];

  return (
    <div>
      {/* Category legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {categories.map((cat) => {
          const t = transports.find((tr) => tr.category === cat);
          return (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: t?.categoryColor || "#888",
                }}
              />
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: colors.textSecondary }}>
                {cat}
              </span>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {transports.map((transport) => {
          const isSelected = selectedTransport === transport.id;
          return (
            <motion.button
              key={transport.id}
              onClick={() =>
                setSelectedTransport(isSelected ? null : transport.id)
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                padding: "14px 16px",
                borderRadius: 10,
                border: `1px solid ${isSelected ? transport.categoryColor : colors.cardBorder}`,
                background: isSelected
                  ? `${transport.categoryColor}10`
                  : colors.cardBg,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
                position: "relative",
              }}
            >
              {/* Category dot */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: transport.categoryColor,
                }}
              />

              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: isSelected ? transport.categoryColor : colors.text,
                  marginBottom: 4,
                  paddingRight: 20,
                }}
              >
                {transport.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: transport.categoryColor,
                  marginBottom: 8,
                }}
              >
                {transport.category}
              </div>
              <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.5 }}>
                {transport.description}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected transport detail */}
      <AnimatePresence>
        {selectedTransport && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            {(() => {
              const t = transports.find((tr) => tr.id === selectedTransport);
              if (!t) return null;
              return (
                <div
                  style={{
                    padding: "18px 22px",
                    borderRadius: 12,
                    border:  INLINECODE4 ,
                    background:  INLINECODE5 ,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: colors.text,
                      marginBottom: 16,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t.name}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: t.categoryColor,
                          fontFamily: "var(--font-mono)",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        运作方式
                      </div>
                      <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.6 }}>
                        {t.howItWorks}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: t.categoryColor,
                          fontFamily: "var(--font-mono)",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        使用时机
                      </div>
                      <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.6 }}>
                        {t.whenToUse}
                      </div>
                    </div>
                  </div>

                  {/* Connection flow */}
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: t.categoryColor,
                      fontFamily: "var(--font-mono)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    连线流程
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {t.connectionFlow.map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                        <div
                          style={{
                            flex: 1,
                            textAlign: "center",
                            padding: "8px 6px",
                            borderRadius: 8,
                            background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            color: colors.text,
                          }}
                        >
                          {step}
                        </div>
                        {i < t.connectionFlow.length - 1 && (
                          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M2 6H14M14 6L10 2M14 6L10 10" stroke={t.categoryColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Decision Tree ---

function DecisionTree({
  colors,
  isDark,
  currentNode,
  path,
  onAdvance,
  onReset,
  onBack,
}: {
  colors: Record<string, string>;
  isDark: boolean;
  currentNode: DecisionNode;
  path: string[];
  onAdvance: (id: string) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const isResult = !!currentNode.result;

  return (
    <div>
      {/* Path breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        {path.map((nodeId, i) => {
          const node = decisionTree.find((n) => n.id === nodeId);
          return (
            <div key={nodeId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M4 2L8 6L4 10" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: i === path.length - 1 ? colors.accent : colors.textSecondary,
                  fontWeight: i === path.length - 1 ? 600 : 400,
                }}
              >
                {node?.result ? "结果" : node?.question?.split("？")[0] || "开始"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current node */}
      <motion.div
        key={currentNode.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          padding: "24px 28px",
          borderRadius: 14,
          border:  INLINECODE6 ,
          background: isResult ? colors.greenBg : colors.cardBg,
          marginBottom: 20,
        }}
      >
        {isResult ? (
          <div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: colors.green,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 8,
              }}
            >
              推荐
            </div>
            <div style={{ fontSize: 15, color: colors.text, lineHeight: 1.6, marginBottom: 16 }}>
              {currentNode.result}
            </div>
            {currentNode.resultTransport && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: transports.find((t) => t.id === currentNode.resultTransport)?.categoryColor || colors.accent,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: transports.find((t) => t.id === currentNode.resultTransport)?.categoryColor || colors.accent,
                  }}
                />
                {transports.find((t) => t.id === currentNode.resultTransport)?.name}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: colors.text,
                marginBottom: 20,
              }}
            >
              {currentNode.question}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {currentNode.options.map((opt) => (
                <motion.button
                  key={opt.next}
                  onClick={() => onAdvance(opt.next)}
                  whileHover={{ scale: 1.01, x: 4 }}
                  whileTap={{ scale: 0.99 }}
                  style={{
                    padding: "14px 18px",
                    borderRadius: 10,
                    border: `1px solid ${colors.cardBorder}`,
                    background: colors.surfaceBg,
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 13,
                    color: colors.text,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "border-color 0.2s",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M6 4L10 8L6 12" stroke={colors.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {opt.label}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8 }}>
        {path.length > 1 && (
          <button
            onClick={onBack}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border:  INLINECODE8 ,
              background: "transparent",
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
            }}
          >
            上一步
          </button>
        )}
        {path.length > 1 && (
          <button
            onClick={onReset}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border:  INLINECODE9 ,
              background: "transparent",
              color: colors.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
            }}
          >
            重新开始
          </button>
        )}
      </div>
    </div>
  );
}

// --- OAuth Flow ---

function OAuthFlow({
  colors,
  isDark,
  activeStep,
  setActiveStep,
}: {
  colors: Record<string, string>;
  isDark: boolean;
  activeStep: number | null;
  setActiveStep: (step: number | null) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 6 }}>
        RFC 9728 + RFC 8414 OAuth 探索链
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 20, lineHeight: 1.5 }}>
        当 MCP 服务器返回 401 时，Claude Code 会遍历多步骤探索链来找到授权服务器。
        点击每个步骤查看详细信息。
      </div>

      <div style={{ position: "relative", paddingLeft: 28 }}>
        {/* Vertical connector */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 20,
            bottom: 20,
            width: 2,
            background: colors.cardBorder,
          }}
        />

        {oauthSteps.map((step, i) => {
          const isActive = activeStep === step.id;
          return (
            <div key={step.id} style={{ position: "relative", marginBottom: i < oauthSteps.length - 1 ? 10 : 0 }}>
              {/* Dot */}
              <motion.div
                animate={{
                  background: isActive ? colors.accent : colors.textSecondary,
                  scale: isActive ? 1.3 : 1,
                }}
                style={{
                  position: "absolute",
                  left: -28 + 14 - 5,
                  top: 18,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  zIndex: 1,
                  transition: "all 0.2s",
                }}
              />

              <motion.button
                onClick={() => setActiveStep(isActive ? null : step.id)}
                whileHover={{ scale: 1.01 }}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: 10,
                  border: `1px solid ${isActive ? colors.accent : colors.cardBorder}`,
                  background: isActive ? colors.accentBg : colors.cardBg,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: isActive ? colors.accent : colors.textSecondary,
                      minWidth: 24,
                    }}
                  >
                    {String(step.id).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isActive ? colors.accent : colors.text,
                      flex: 1,
                    }}
                  >
                    {step.title}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: colors.textSecondary,
                    marginTop: 4,
                    marginLeft: 34,
                  }}
                >
                  {step.description}
                </div>

                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          marginTop: 10,
                          marginLeft: 34,
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: colors.surfaceBg,
                          lineHeight: 1.6,
                        }}
                      >
                        {step.detail}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Fallback chain */}
      <div
        style={{
          marginTop: 20,
          padding: "14px 18px",
          borderRadius: 12,
          border:  INLINECODE11 ,
          background: colors.cardBg,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 8 }}>
          回退链
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
          {[
            { label: "RFC 9728", desc: "受保护资源" },
            { label: "RFC 8414", desc: "授权服务器元数据" },
            { label: "路径感知探测", desc: "对 MCP 服务器 URL" },
            { label: "authServerMetadataUrl", desc: "逃生门设置" },
          ].map((step, i) => (
            <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  textAlign: "center",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: colors.surfaceBg,
                  minWidth: 80,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)", color: colors.accent }}>
                  {step.label}
                </div>
                <div style={{ fontSize: 9, color: colors.textSecondary, marginTop: 2 }}>{step.desc}</div>
              </div>
              {i < 3 && (
                <div style={{ padding: "0 4px" }}>
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <path d="M2 6H14M14 6L10 2M14 6L10 10" stroke={colors.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 10, lineHeight: 1.5 }}>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>authServerMetadataUrl</code> 逃生门的存在是因为某些 OAuth 服务器未实现任一 RFC。
        </div>
      </div>
    </div>
  );
}
