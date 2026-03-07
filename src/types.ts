// OSSFactory-Scaler — All interfaces

export type ModelTier = "micro" | "fast" | "standard" | "engineering";

export type AgentRole = "scout" | "builder" | "demo" | "maintainer" | "critic";

export type WorkItemType = "upgrade" | "fix" | "demo" | "docs" | "test" | "feature";

export interface ModelConfig {
  id: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  maxContext: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TokenEntry {
  timestamp: string;
  model: string;
  tier: ModelTier;
  agent: AgentRole;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  task: string;
}

export interface DailyBudget {
  date: string;
  entries: TokenEntry[];
  totalCost: number;
  limitUsd: number;
}

export interface VDayWindow {
  index: number;
  label: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

export interface BuildResult {
  attempted: string | null;
  result: "shipped" | "failed" | "skipped";
  repairPasses?: number;
  gateDetails?: string;
  costUsd?: number;
  wallTimeMs?: number;
}

export interface VDayReport {
  vday: string;
  timestamp: string;
  scout: { reposScanned: number; workItemsQueued: number };
  builders: BuildResult[];
  critic: { reviewed: boolean; observation: string };
  demo: { created: string | null; updated: string | null };
  maintainer: { issuesTriaged: number; healthChecks: number };
  budgetUsed: number;
  budgetRemaining: number;
}

export interface BuildFeedback {
  timestamp: string;
  repo: string;
  workType: WorkItemType;
  result: "shipped" | "failed" | "skipped";
  gateDetails: string;
  repairPasses: number;
  costUsd: number;
  wallTimeMs: number;
  tier: ModelTier;
  description: string;
}

export interface CriticHint {
  rule: string;
  category: string;
  examples: string[];
  score: number;
  createdAt: string;
}

export interface PromptRule {
  id: string;
  rule: string;
  context: string;
  score: number;
  applied: number;
  createdAt: string;
}

export interface ImprovementSnapshot {
  timestamp: string;
  shipRate: number;
  avgCostPerShip: number;
  featureRatio: number;
  avgRepairPasses: number;
  buildsAnalyzed: number;
  velocity: "improving" | "stable" | "declining";
}

export interface RepoAudit {
  name: string;
  fullName: string;
  description: string;
  stars: number;
  lastPush: string;
  hasReadme: boolean;
  readmeLength: number;
  hasTests: boolean;
  hasLicense: boolean;
  hasCi: boolean;
  openIssues: number;
  version: string;
  qualityScore: number;
  lastAuditDate: string;
  upgradeOpportunities: string[];
}

export interface WorkItem {
  id: string;
  repo: string;
  type: WorkItemType;
  priority: number;
  description: string;
  createdAt: string;
  status: "queued" | "in-progress" | "completed" | "failed";
  assignedTo?: AgentRole;
  result?: string;
}

export interface ScalerState {
  workQueue: WorkItem[];
  repoAudits: RepoAudit[];
  completedWork: WorkItem[];
  vdayReports: VDayReport[];
  lastScoutRun: string | null;
  currentVDay: number;
}

export interface SlicingPieEntry {
  timestamp: string;
  agent: AgentRole;
  action: string;
  points: number;
  reason: string;
}

export interface SlicingPieState {
  entries: SlicingPieEntry[];
  totals: Record<AgentRole, number>;
}

export interface QualityGateResult {
  gate: string;
  passed: boolean;
  score: number;
  details: string;
}

export interface ShipReadiness {
  gates: QualityGateResult[];
  compositeScore: number;
  ready: boolean;
}

export interface RepoBuildContext {
  repoName: string;
  cloneDir: string;
  packageJson: Record<string, unknown> | null;
  sourceFiles: string[];
  testFiles: string[];
  readme: string;
  currentVersion: string;
}

export interface DemoPageConfig {
  repoName: string;
  title: string;
  description: string;
  repoUrl: string;
  version: string;
  interactiveBody: string;
}

export interface HealthScore {
  repo: string;
  score: number;
  factors: {
    hasReadme: boolean;
    hasTests: boolean;
    hasLicense: boolean;
    hasCi: boolean;
    recentActivity: boolean;
    lowIssueCount: boolean;
  };
  lastChecked: string;
}
