export type StrategyRefreshArtifactFamily =
  | "overview"
  | "personas"
  | "journey-maps"
  | "ideas"
  | "features"
  | "ia"
  | "user-flows"
  | "insights";

const STRATEGY_REFRESH_PATTERNS: Array<[StrategyRefreshArtifactFamily, RegExp[]]> = [
  [
    "overview",
    [
      /\boverview\b/,
      /\boverview card\b/,
      /\bmanifesto\b/,
      /\bproblem overview\b/,
      /\bproblem statement\b/,
      /\btarget user\b/,
      /\bjtbd\b/,
      /\bjobs to be done\b/,
      /\bjobs-to-be-done\b/,
      /\bhmw\b/,
      /\bhow might we\b/,
    ],
  ],
  [
    "personas",
    [
      /\bpersona\b/,
      /\bpersonas\b/,
      /\buser persona\b/,
      /\buser personas\b/,
    ],
  ],
  [
    "journey-maps",
    [
      /\bjourney map\b/,
      /\bjourney maps\b/,
      /\buser journey\b/,
      /\buser journey map\b/,
    ],
  ],
  [
    "ideas",
    [
      /\bideas\b/,
      /\bidea\s+\d+\b/,
      /\bidea card\b/,
      /\bselected idea\b/,
      /\bapproved idea\b/,
      /\bcrazy 8s\b/,
      /\bcrazy 8's\b/,
    ],
  ],
  [
    "features",
    [
      /\bfeature\b/,
      /\bfeatures\b/,
      /\bkey feature\b/,
      /\bkey features\b/,
    ],
  ],
  [
    "ia",
    [
      /\bia\b/,
      /\binformation architecture\b/,
      /\barchitecture\b/,
    ],
  ],
  [
    "user-flows",
    [
      /\buser flow\b/,
      /\buser flows\b/,
      /\bflow map\b/,
      /\bflow maps\b/,
    ],
  ],
  [
    "insights",
    [
      /\binsight\b/,
      /\binsights\b/,
      /\bresearch insight\b/,
      /\bresearch insights\b/,
    ],
  ],
];

export function detectStrategyRefreshArtifactFamilies(messageText: string): StrategyRefreshArtifactFamily[] {
  const normalized = messageText.toLowerCase();
  return STRATEGY_REFRESH_PATTERNS.flatMap(([family, patterns]) =>
    patterns.some((pattern) => pattern.test(normalized)) ? [family] : []
  );
}

export function isStrategyRefreshRequest(messageText: string): boolean {
  return detectStrategyRefreshArtifactFamilies(messageText).length > 0;
}

export function resolveStrategyRefreshRequestPhase(
  currentPhase: string | null | undefined,
  explicitArtifacts: StrategyRefreshArtifactFamily[],
): "problem-overview" | "solution-design" | "handoff" {
  if (currentPhase === "handoff") {
    return "handoff";
  }

  const solutionOnly = explicitArtifacts.length > 0 &&
    explicitArtifacts.every((artifact) =>
      artifact === "ideas" || artifact === "features" || artifact === "ia" || artifact === "user-flows"
    );

  return solutionOnly ? "solution-design" : "problem-overview";
}
