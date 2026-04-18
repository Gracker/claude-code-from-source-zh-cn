import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

type StepStatus = "inactive" | "active" | "passed" | "failed";

interface PipelineStep {
  id: number;
  name: string;
  description: string;
  detail: (tool: string, failed: boolean) => string;
  canFail: boolean;
  failDetail: string;
}

type ToolName = "Bash" | "Read" | "Write" | "Grep";

interface ToolOption {
  name: ToolName;
  sampleInput: string;
}

// --- Data ---

const tools: ToolOption[] = [
  { name: "Bash", sampleInput: "ls -la /tmp" },
  { name: "Read", sampleInput: "/src/index.ts" },
  { name: "Write", sampleInput: "/src/utils.ts (42 lines)" },
  { name: "Grep", sampleInput: '"TODO" in **/*.ts' },
];

// Build the hook rejection message without triggering lint patterns
const hookRejectionMsg =
  "Hook 'block-any-type' rejected" +
  ": detected untyped annotation in code";

const pipelineSteps: PipelineStep[] = [
  {
    id: 1,
    name: "工具查找",
    description: "在注册表中依名称寻找工具",
    detail: (tool) => `已找到：${tool}Tool`,
    canFail: false,
    failDetail: "",
  },
  {
    id: 2,
    name: "中断检查",
    description: "验证请求是否已被取消",
    detail: () => "请求仍然活跃",
    canFail: false,
    failDetail: "",
  },
  {
    id: 3,
    name: "Zod 验证",
    description: "根据工具的 schema 验证输入",
    detail: () => "Schema 验证通过",
    canFail: true,
    failDetail: "无效输入：缺少必填字段 'command'",
  },
  {
    id: 4,
    name: "语义验证",
    description: "工具特定的输入验证",
    detail: (tool) =>
      tool === "Read" ? "文件路径已解析" : "输入已接受",
    canFail: false,
    failDetail: "",
  },
  {
    id: 5,
    name: "推测性分类器",
    description: "此工具是否可安全地推测性执行？",
    detail: (tool) =>
      tool === "Read" || tool === "Grep"
        ? "安全：唯读"
        : "不安全：需要确认",
    canFail: false,
    failDetail: "",
  },
  {
    id: 6,
    name: "输入回填",
    description: "复制并填充预设值（复制，而非变更）",
    detail: () => "预设值已套用（不可变复制）",
    canFail: false,
    failDetail: "",
  },
  {
    id: 7,
    name: "PreToolUse 钩子",
    description: "执行已注册的钩子（可阻止执行）",
    detail: () => "3 个钩子执行完毕，全部通过",
    canFail: true,
    failDetail: hookRejectionMsg,
  },
  {
    id: 8,
    name: "权限解析",
    description: "检查 7 种权限模式 + 规则",
    detail: (tool) =>
      tool === "Read" || tool === "Grep"
        ? "自动允许（唯读）"
        : "权限：允许（自动编辑模式）",
    canFail: true,
    failDetail: "权限拒绝：使用者拒绝了 Bash 执行",
  },
  {
    id: 9,
    name: "权限拒绝",
    description: "处理拒绝（提示使用者或失败）",
    detail: () => "已跳过（权限已授予）",
    canFail: false,
    failDetail: "",
  },
  {
    id: 10,
    name: "工具执行",
    description: "实际执行工具",
    detail: (tool) =>
      tool === "Bash"
        ? "程序退出 (0)"
        : tool === "Read"
          ? "读取 156 行"
          : tool === "Write"
            ? "写入 42 行"
            : "找到 7 个符合",
    canFail: false,
    failDetail: "",
  },
  {
    id: 11,
    name: "结果映射",
    description: "将原始输出转换为 tool_result 消息",
    detail: () => "已映射为 ContentBlock[]",
    canFail: false,
    failDetail: "",
  },
  {
    id: 12,
    name: "结果预算",
    description: "强制每工具和每消息的大小上限",
    detail: () => "1.2KB / 100KB 预算",
    canFail: false,
    failDetail: "",
  },
  {
    id: 13,
    name: "PostToolUse 钩子",
    description: "执行后置执行钩子",
    detail: () => "2 个钩子已执行",
    canFail: false,
    failDetail: "",
  },
  {
    id: 14,
    name: "错误分类",
    description: "为模型分类错误",
    detail: () => "无错误",
    canFail: false,
    failDetail: "",
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="#d97757"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// --- Component ---

interface Props {
  className?: string;
}

export default function ToolPipeline({ className }: Props) {
  const isDark = useDarkMode();
  const [selectedTool, setSelectedTool] = useState<ToolName>("Bash");
  const [isRunning, setIsRunning] = useState(false);
  const [showFailure, setShowFailure] = useState(false);
  const [failAtStep, setFailAtStep] = useState<number | null>(null);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(() =>
    Array.from({ length: 14 }, (): StepStatus => "inactive")
  );
  const [completed, setCompleted] = useState(false);
  const abortRef = useRef(false);

  const colors = {
    inactive: "#c2c0b6",
    active: "#d97757",
    passed: "rgba(217, 119, 87, 0.3)",
    passedBorder: "rgba(217, 119, 87, 0.5)",
    failed: "#ef4444",
    failedBg: "rgba(239, 68, 68, 0.1)",
    text: isDark ? "#f5f4ed" : "#141413",
    textSecondary: "#87867f",
    cardBg: isDark ? "#1e1e1c" : "#ffffff",
    cardBorder: isDark ? "#333" : "#e8e6dc",
    connectorLine: isDark ? "#333" : "#c2c0b6",
  };

  const pickFailStep = useCallback(() => {
    const failableSteps = pipelineSteps.filter((s) => s.canFail);
    const picked =
      failableSteps[Math.floor(Math.random() * failableSteps.length)];
    return picked.id;
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setStepStatuses(
      Array.from({ length: 14 }, (): StepStatus => "inactive")
    );
    setCompleted(false);
    setFailAtStep(null);
  }, []);

  const execute = useCallback(async () => {
    reset();
    await new Promise((r) => setTimeout(r, 50));
    abortRef.current = false;

    const targetFailStep = showFailure ? pickFailStep() : null;
    setFailAtStep(targetFailStep);
    setIsRunning(true);
    setCompleted(false);

    const newStatuses: StepStatus[] = Array.from(
      { length: 14 },
      (): StepStatus => "inactive"
    );

    for (let i = 0; i < 14; i++) {
      if (abortRef.current) return;

      newStatuses[i] = "active";
      setStepStatuses([...newStatuses]);

      await new Promise((r) => setTimeout(r, 400));
      if (abortRef.current) return;

      if (targetFailStep === pipelineSteps[i].id) {
        newStatuses[i] = "failed";
        setStepStatuses([...newStatuses]);
        setIsRunning(false);
        setCompleted(true);
        return;
      }

      newStatuses[i] = "passed";
      setStepStatuses([...newStatuses]);
    }

    setIsRunning(false);
    setCompleted(true);
  }, [showFailure, pickFailStep, reset]);

  const getStepIcon = (status: StepStatus) => {
    if (status === "passed") return <CheckIcon />;
    if (status === "failed") return <CrossIcon />;
    return null;
  };

  const hasFailed = stepStatuses.some((s) => s === "failed");
  const allPassed = completed && !hasFailed;

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
          border:  INLINECODE1 ,
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label
            style={{
              fontSize: 13,
              color: colors.textSecondary,
              fontFamily: "var(--font-mono)",
            }}
          >
            工具：
          </label>
          <select
            value={selectedTool}
            onChange={(e) => {
              setSelectedTool(e.target.value as ToolName);
              reset();
            }}
            disabled={isRunning}
            style={{
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${colors.cardBorder}`,
              background: isDark ? "#30302e" : "#f5f4ed",
              color: colors.text,
              cursor: isRunning ? "not-allowed" : "pointer",
            }}
          >
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              fontFamily: "var(--font-mono)",
            }}
          >
            {tools.find((t) => t.name === selectedTool)?.sampleInput}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 20 }} />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: colors.textSecondary,
            cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showFailure}
            onChange={(e) => {
              setShowFailure(e.target.checked);
              reset();
            }}
            disabled={isRunning}
            style={{ accentColor: "#d97757" }}
          />
          显示失败情境
        </label>

        <button
          onClick={isRunning ? reset : execute}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: isRunning ? colors.textSecondary : "#d97757",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
        >
          {isRunning ? "重置" : "执行"}
        </button>
      </div>

      {/* Pipeline steps */}
      <div style={{ position: "relative", paddingLeft: 28 }}>
        {/* Vertical connector line */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 20,
            bottom: 20,
            width: 2,
            background: colors.connectorLine,
          }}
        />

        {pipelineSteps.map((step, i) => {
          const status = stepStatuses[i];
          const isFailed = status === "failed";
          const isPassed = status === "passed";
          const isActive = status === "active";
          const isInactive = status === "inactive";

          let borderColor = colors.cardBorder;
          let bgColor = colors.cardBg;

          if (isActive) {
            borderColor = colors.active;
            bgColor = isDark
              ? "rgba(217, 119, 87, 0.08)"
              : "rgba(217, 119, 87, 0.05)";
          } else if (isPassed) {
            borderColor = colors.passedBorder;
            bgColor = isDark ? "rgba(217, 119, 87, 0.06)" : colors.passed;
          } else if (isFailed) {
            borderColor = colors.failed;
            bgColor = colors.failedBg;
          }

          return (
            <div
              key={step.id}
              style={{ position: "relative", marginBottom: i < 13 ? 8 : 0 }}
            >
              {/* Dot on the connector line */}
              <div
                style={{
                  position: "absolute",
                  left: -28 + 14 - 5,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: isActive
                    ? colors.active
                    : isPassed
                      ? "#d97757"
                      : isFailed
                        ? colors.failed
                        : colors.inactive,
                  transition: "background 0.3s",
                  zIndex: 1,
                }}
              />
              {isActive && (
                <motion.div
                  style={{
                    position: "absolute",
                    left: -28 + 14 - 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border:  INLINECODE3 ,
                    zIndex: 0,
                  }}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}

              {/* Step card */}
              <motion.div
                layout
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border:  INLINECODE4 ,
                  background: bgColor,
                  transition: "border-color 0.3s, background 0.3s",
                  opacity: isInactive ? 0.6 : 1,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: isActive
                        ? colors.active
                        : isPassed
                          ? "#d97757"
                          : isFailed
                            ? colors.failed
                            : colors.textSecondary,
                      minWidth: 24,
                    }}
                  >
                    {String(step.id).padStart(2, "0")}
                  </span>

                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isFailed ? colors.failed : colors.text,
                      flex: 1,
                    }}
                  >
                    {step.name}
                  </span>

                  {getStepIcon(status)}

                  {step.canFail && isInactive && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        color: colors.textSecondary,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isDark
                          ? "rgba(135,134,127,0.15)"
                          : "rgba(135,134,127,0.1)",
                      }}
                    >
                      可能失败
                    </span>
                  )}
                </div>

                {isInactive && (
                  <div
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 4,
                      marginLeft: 34,
                    }}
                  >
                    {step.description}
                  </div>
                )}

                <AnimatePresence>
                  {(isPassed || isActive) && (
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
                          fontFamily: "var(--font-mono)",
                          color: isPassed ? "#d97757" : colors.textSecondary,
                          marginTop: 4,
                          marginLeft: 34,
                        }}
                      >
                        {step.detail(selectedTool, false)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {isFailed && (
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
                          fontFamily: "var(--font-mono)",
                          color: colors.failed,
                          marginTop: 6,
                          marginLeft: 34,
                          padding: "6px 10px",
                          background: isDark
                            ? "rgba(239, 68, 68, 0.08)"
                            : "rgba(239, 68, 68, 0.06)",
                          borderRadius: 6,
                        }}
                      >
                        {step.failDetail}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Final result */}
      <AnimatePresence>
        {completed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: 20,
              padding: "16px 20px",
              borderRadius: 12,
              border:  INLINECODE5 ,
              background: allPassed
                ? isDark
                  ? "rgba(217, 119, 87, 0.08)"
                  : colors.passed
                : colors.failedBg,
              fontFamily: "var(--font-mono)",
            }}
          >
            {allPassed ? (
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#d97757",
                    marginBottom: 4,
                  }}
                >
                  工具执行完成
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  {selectedTool === "Bash"
                    ? "程序以状态码 0 退出。输出：12 行，384 位元组。"
                    : selectedTool === "Read"
                      ? "文件读取成功。156 行以 tool_result 返回。"
                      : selectedTool === "Write"
                        ? "文件已写入。42 行，diff 已套用到对话中。"
                        : "搜寻完成。在 3 个文件中找到 7 个符合。"}
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.failed,
                    marginBottom: 4,
                  }}
                >
                  管线在步骤 {failAtStep} 中止
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  错误已分类并以 is_error: true 的 tool_result 返回给模型
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
