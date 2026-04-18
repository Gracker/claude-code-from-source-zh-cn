import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Dark mode hook ---

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

// --- Data ---

type Provider = "direct" | "bedrock" | "vertex";

interface PromptSection {
  id: string;
  label: string;
  tier: "static" | "boundary" | "dynamic";
  description: string;
  tokenEstimate: string;
  cacheScope: string;
  contents: string[];
}

const PROMPT_SECTIONS: PromptSection[] = [
  {
    id: "identity",
    label: "身分与介绍",
    tier: "static",
    description: "系统身分、角色描述和行为基础",
    tokenEstimate: "~200",
    cacheScope: "global",
    contents: ["你是 Claude Code，一位专家级软件工程师...", "核心行为规则和安全指引"],
  },
  {
    id: "behavior",
    label: "系统行为规则",
    tier: "static",
    description: "回应格式、安全约束、拒绝模式",
    tokenEstimate: "~500",
    cacheScope: "global",
    contents: ["工具呼叫惯例", "错误处理规则", "安全和内容政策"],
  },
  {
    id: "tasks",
    label: "任务执行指引",
    tier: "static",
    description: "如何处理多步骤任务、规划和验证",
    tokenEstimate: "~400",
    cacheScope: "global",
    contents: ["任务分解规则", "验证需求", "何时询问 vs. 直接执行"],
  },
  {
    id: "actions",
    label: "动作指引",
    tier: "static",
    description: "工具定义、纲要和使用说明",
    tokenEstimate: "~2,000",
    cacheScope: "global",
    contents: ["Read、Write、Edit、Bash、Glob、Grep 工具纲要", "工具选择启发法", "文件操作规则"],
  },
  {
    id: "tools",
    label: "工具使用说明",
    tier: "static",
    description: "每个工具的详细使用模式和约束",
    tokenEstimate: "~3,000",
    cacheScope: "global",
    contents: ["Git 工作流规则", "先搜寻再建立模式", "文件编辑最佳实践"],
  },
  {
    id: "tone",
    label: "语气与风格",
    tier: "static",
    description: "输出格式、简洁规则、沟通风格",
    tokenEstimate: "~300",
    cacheScope: "global",
    contents: ["预设简洁", "无不必要的前言", "技术精确性"],
  },
  {
    id: "efficiency",
    label: "输出效率",
    tier: "static",
    description: "最小化 token 输出同时最大化实用性的规则",
    tokenEstimate: "~200",
    cacheScope: "global",
    contents: ["避免重述问题", "仅显示相关代码", "批次工具呼叫"],
  },
  {
    id: "boundary",
    label: "=== 动态边界 ===",
    tier: "boundary",
    description: "缓存断点：以上所有内容在所有使用者之间全域共享。以下所有内容是每个会话独立的。将区段移过这个边界会影响全域缓存性能。",
    tokenEstimate: "marker",
    cacheScope: "break",
    contents: ["以下每个条件都是一个执行时位元，否则会使 Blake2b 前缀哈希变体倍增 (2^N)"],
  },
  {
    id: "session",
    label: "会话指引",
    tier: "dynamic",
    description: "会话特定的行为覆写和功能旗标",
    tokenEstimate: "~300",
    cacheScope: "per-session",
    contents: ["当前权限模式", "启用的功能旗标", "会话类型（REPL vs 单次执行）"],
  },
  {
    id: "memory",
    label: "记忆（CLAUDE.md）",
    tier: "dynamic",
    description: "从文件系统加载的项目特定指令",
    tokenEstimate: "~2,000-50,000",
    cacheScope: "per-session",
    contents: ["使用者的 CLAUDE.md 内容", "项目惯例", "自订规则和偏好"],
  },
  {
    id: "environment",
    label: "环境信息",
    tier: "dynamic",
    description: "Git 状态、工作目录、作业系统、shell 信息",
    tokenEstimate: "~500",
    cacheScope: "per-session",
    contents: ["Git 分支、状态、最近提交", "工作目录路径", "作业系统和 shell 版本"],
  },
  {
    id: "language",
    label: "语言偏好",
    tier: "dynamic",
    description: "使用者偏好的回应语言",
    tokenEstimate: "~50",
    cacheScope: "per-session",
    contents: ["以使用者的语言回应"],
  },
  {
    id: "mcp",
    label: "MCP 指令",
    tier: "dynamic",
    description: "危险：使用者特定的 MCP 工具定义。当存在时会停用全域缓存范围，因为 MCP 定义对每个使用者都是唯一的。",
    tokenEstimate: "~1,000-10,000",
    cacheScope: "UNCACHED",
    contents: ["MCP 服务器工具定义", "每个工具的指令", "服务器连线详细信息"],
  },
  {
    id: "output-style",
    label: "输出风格",
    tier: "dynamic",
    description: "会话特定的输出格式偏好",
    tokenEstimate: "~100",
    cacheScope: "per-session",
    contents: ["详细模式设置", "展开检视偏好"],
  },
];

const PROVIDER_INFO: Record<Provider, { label: string; authDesc: string; envVar: string; color: string }> = {
  direct: {
    label: "直接 API",
    authDesc: "API 金钥或 OAuth token",
    envVar: "ANTHROPIC_API_KEY",
    color: "#d97757",
  },
  bedrock: {
    label: "AWS Bedrock",
    authDesc: "AWS 凭据（IAM 角色 / 存取金钥）",
    envVar: "ANTHROPIC_BEDROCK_BASE_URL",
    color: "#ff9900",
  },
  vertex: {
    label: "Google Vertex AI",
    authDesc: "Google 验证（服务帐户 / ADC）",
    envVar: "ANTHROPIC_VERTEX_PROJECT_ID",
    color: "#4285f4",
  },
};

interface ToggleFeature {
  id: string;
  label: string;
  default: boolean;
  effect: string;
}

const TOGGLE_FEATURES: ToggleFeature[] = [
  { id: "extended-thinking", label: "延伸思考", default: false, effect: "在请求主体加入思考预算——改变缓存金钥" },
  { id: "mcp-tools", label: "MCP 工具", default: false, effect: "加入使用者特定的工具定义——停用全域缓存范围" },
  { id: "auto-mode", label: "自动模式 (AFK)", default: false, effect: "加入 beta 请求头——一旦锁定，整个会话都保持" },
];

// --- Component ---

interface Props {
  className?: string;
}

export default function APICallLifecycle({ className }: Props) {
  const isDark = useDarkMode();
  const [selectedProvider, setSelectedProvider] = useState<Provider>("direct");
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({
    "extended-thinking": false,
    "mcp-tools": false,
    "auto-mode": false,
  });

  const colors = {
    terracotta: "#d97757",
    text: isDark ? "#f5f4ed" : "#141413",
    textSecondary: isDark ? "#87867f" : "#87867f",
    bg: isDark ? "#1e1e1c" : "#ffffff",
    bgCard: isDark ? "#2a2a28" : "#f8f7f2",
    border: isDark ? "#333" : "#c2c0b6",
    // Cache tiers
    staticBg: isDark ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.06)",
    staticBorder: isDark ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.2)",
    staticAccent: "#22c55e",
    boundaryBg: isDark ? "rgba(217,119,87,0.15)" : "rgba(217,119,87,0.08)",
    boundaryBorder: isDark ? "rgba(217,119,87,0.5)" : "rgba(217,119,87,0.4)",
    dynamicBg: isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.06)",
    dynamicBorder: isDark ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.2)",
    dynamicAccent: "#f59e0b",
    uncachedBg: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.06)",
    uncachedBorder: isDark ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.2)",
    uncachedAccent: "#ef4444",
  };

  const toggleFeature = useCallback((id: string) => {
    setFeatures((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Compute effective sections based on features
  const effectiveSections = PROMPT_SECTIONS.filter((section) => {
    if (section.id === "mcp" && !features["mcp-tools"]) return false;
    return true;
  });

  // Calculate total tokens for static vs dynamic
  const staticTokens = effectiveSections
    .filter((s) => s.tier === "static")
    .reduce((sum, s) => {
      const match = s.tokenEstimate.match(/[\d,]+/);
      return sum + (match ? parseInt(match[0].replace(",", "")) : 0);
    }, 0);

  const hasMcp = features["mcp-tools"];
  const globalCacheDisabled = hasMcp;

  const getSectionBackground = (section: PromptSection) => {
    if (section.tier === "boundary") return colors.boundaryBg;
    if (section.tier === "static") return colors.staticBg;
    if (section.id === "mcp") return colors.uncachedBg;
    return colors.dynamicBg;
  };

  const getSectionBorder = (section: PromptSection) => {
    if (section.tier === "boundary") return colors.boundaryBorder;
    if (section.tier === "static") return colors.staticBorder;
    if (section.id === "mcp") return colors.uncachedBorder;
    return colors.dynamicBorder;
  };

  const getSectionAccent = (section: PromptSection) => {
    if (section.tier === "boundary") return colors.terracotta;
    if (section.tier === "static") return colors.staticAccent;
    if (section.id === "mcp") return colors.uncachedAccent;
    return colors.dynamicAccent;
  };

  const getCacheScopeLabel = (section: PromptSection) => {
    if (section.tier === "boundary") return "BREAK";
    if (section.tier === "static") {
      return globalCacheDisabled ? "per-session (MCP present)" : "global";
    }
    if (section.id === "mcp") return "UNCACHED";
    return "per-session";
  };

  return (
    <div className={className} style={{ fontFamily: "var(--font-serif)" }}>
      {/* Provider selector */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            fontFamily: "var(--font-mono)",
            alignSelf: "center",
          }}
        >
          提供者：
        </span>
        {(Object.keys(PROVIDER_INFO) as Provider[]).map((provider) => {
          const info = PROVIDER_INFO[provider];
          const isActive = selectedProvider === provider;
          return (
            <button
              key={provider}
              onClick={() => setSelectedProvider(provider)}
              style={{
                background: isActive ? info.color : "transparent",
                color: isActive ? "#fff" : colors.textSecondary,
                border: `1px solid ${isActive ? info.color : colors.border}`,
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Provider info strip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedProvider}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          style={{
            textAlign: "center",
            marginBottom: 16,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: colors.textSecondary,
          }}
        >
          Auth: {PROVIDER_INFO[selectedProvider].authDesc} -- env: <code style={{ fontSize: 11, padding: "1px 4px", borderRadius: 3, background: isDark ? "#333" : "#e8e6dc" }}>{PROVIDER_INFO[selectedProvider].envVar}</code>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>
            所有提供者通过类型抹除被转换为 <code style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: isDark ? "#333" : "#e8e6dc" }}>Anthropic</code> —— 消费者永远不会对提供者分支。
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Main layout: prompt stack + details */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 16,
          background: colors.bg,
          border:  INLINECODE1 ,
          borderRadius: 8,
          padding: 16,
        }}
      >
        {/* Left: Prompt section stack */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: 1,
              color: colors.textSecondary,
              marginBottom: 10,
            }}
          >
            系统提示结构
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {effectiveSections.map((section) => {
              const isHovered = hoveredSection === section.id;
              const accent = getSectionAccent(section);
              const isBoundary = section.tier === "boundary";

              return (
                <motion.div
                  key={section.id}
                  onMouseEnter={() => setHoveredSection(section.id)}
                  onMouseLeave={() => setHoveredSection(null)}
                  animate={{
                    scale: isHovered ? 1.01 : 1,
                    borderColor: isHovered ? accent : getSectionBorder(section),
                  }}
                  transition={{ duration: 0.15 }}
                  style={{
                    background: getSectionBackground(section),
                    border: `1px solid ${getSectionBorder(section)}`,
                    borderRadius: isBoundary ? 0 : 6,
                    padding: isBoundary ? "8px 12px" : "8px 12px",
                    cursor: "pointer",
                    position: "relative",
                    borderLeft: isBoundary ? `3px solid ${colors.terracotta}` : `3px solid ${accent}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: isBoundary ? 11 : 12,
                        fontFamily: "var(--font-mono)",
                        fontWeight: isBoundary ? 700 : 500,
                        color: isBoundary ? colors.terracotta : colors.text,
                        letterSpacing: isBoundary ? 1 : 0,
                      }}
                    >
                      {section.label}
                    </span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {!isBoundary && (
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            color: colors.textSecondary,
                            opacity: 0.8,
                          }}
                        >
                          {section.tokenEstimate}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                          color: accent,
                          fontWeight: 600,
                        }}
                      >
                        {getCacheScopeLabel(section)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded on hover */}
                  <AnimatePresence>
                    {isHovered && !isBoundary && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: colors.textSecondary,
                            lineHeight: 1.5,
                          }}
                        >
                          {section.description}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            fontFamily: "var(--font-mono)",
                            color: colors.textSecondary,
                            opacity: 0.8,
                          }}
                        >
                          {section.contents.map((c, i) => (
                            <div key={i} style={{ paddingLeft: 8, borderLeft:  INLINECODE5 , marginBottom: 2 }}>
                              {c}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                    {isHovered && isBoundary && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ overflow: "hidden" }}
                      >
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            color: colors.terracotta,
                            lineHeight: 1.5,
                          }}
                        >
                          {section.description}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right: Info panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Cache indicator */}
          <div
            style={{
              background: colors.bgCard,
              borderRadius: 6,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: 1,
                color: colors.textSecondary,
                marginBottom: 8,
              }}
            >
              缓存状态
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: globalCacheDisabled ? colors.dynamicAccent : colors.staticAccent,
                }}
              />
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: colors.text }}>
                {globalCacheDisabled ? "全域缓存已停用" : "全域缓存已启用"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.5 }}>
              {globalCacheDisabled
                ? "MCP 工具定义是使用者特定的。它们会将全域缓存碎片化为数百万个唯一前缀。"
                : `靜態區段（約 ${staticTokens.toLocaleString()} 個 token）在所有 Claude Code 使用者、工作階段和組織之間快取。`}
            </div>
          </div>

          {/* Feature toggles */}
          <div
            style={{
              background: colors.bgCard,
              borderRadius: 6,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: 1,
                color: colors.textSecondary,
                marginBottom: 8,
              }}
            >
              功能开关
            </div>

            {TOGGLE_FEATURES.map((feature) => {
              const isOn = features[feature.id];
              return (
                <div key={feature.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <button
                      onClick={() => toggleFeature(feature.id)}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: "none",
                        cursor: "pointer",
                        position: "relative",
                        background: isOn ? colors.terracotta : (isDark ? "#444" : "#ccc"),
                        transition: "background 0.2s",
                        flexShrink: 0,
                      }}
                    >
                      <motion.div
                        animate={{ x: isOn ? 16 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          position: "absolute",
                          top: 2,
                          left: 2,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                    <span style={{ fontSize: 12, color: colors.text }}>{feature.label}</span>
                  </div>
                  <AnimatePresence>
                    {isOn && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: colors.terracotta,
                          paddingLeft: 44,
                          lineHeight: 1.4,
                          overflow: "hidden",
                        }}
                      >
                        {feature.effect}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* 2^N explanation */}
          <div
            style={{
              background: isDark ? "rgba(217,119,87,0.08)" : "rgba(217,119,87,0.05)",
              border:  INLINECODE7 ,
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 11,
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, color: colors.terracotta, marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 10 }}>
              2^N 问题
            </div>
            边界之前的每个条件都会使唯一全域缓存条目数量倍增。
            {Object.values(features).filter(Boolean).length > 0 && (
              <span style={{ color: colors.terracotta, fontWeight: 600 }}>
                {" "}当前启用的开关：{Object.values(features).filter(Boolean).length} = {Math.pow(2, Object.values(features).filter(Boolean).length)} 个缓存变体。
              </span>
            )}
            {" "}静态区段刻意设计为无条件，以防止缓存碎片化。
          </div>

          {/* Legend */}
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: colors.textSecondary,
              lineHeight: 1.8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: colors.staticBg, border:  INLINECODE8  }} />
              <span>静态（全域缓存）</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: colors.boundaryBg, border:  INLINECODE9  }} />
              <span>动态边界</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: colors.dynamicBg, border:  INLINECODE10  }} />
              <span>动态（每会话）</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: colors.uncachedBg, border:  INLINECODE11  }} />
              <span>未缓存（危险）</span>
            </div>
          </div>

          {/* Hover hint */}
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: colors.textSecondary,
              fontStyle: "italic",
            }}
          >
            滑鼠悬停区段查看详情
          </div>
        </div>
      </div>

      {/* DANGEROUS naming convention callout */}
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            background: colors.bgCard,
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, color: colors.staticAccent, marginBottom: 4 }}>
            systemPromptSection()
          </div>
          安全。内容放在边界之前。全域缓存。不允许执行时条件。
        </div>
        <div
          style={{
            background: colors.bgCard,
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, color: colors.uncachedAccent, marginBottom: 4 }}>
            DANGEROUS_uncachedSystemPromptSection(_reason)
          </div>
          破坏缓存。需要提供原因字符串。_reason 参数在源码中是强制性文件。
        </div>
      </div>
    </div>
  );
}
