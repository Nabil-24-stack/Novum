import type { InsightsCardData } from "@/hooks/useDocumentStore";
import type {
  JourneyMapData,
  KeyFeaturesData,
  ManifestoData,
  PersonaData,
  UserFlow,
} from "@/hooks/useStrategyStore";
import type { StrategyRefreshArtifactFamily } from "./strategy-refresh";

type StrategyArtifactPhaseHint = "problem-overview" | "solution-design";

export interface SelectedStrategyArtifactContext {
  artifactId: string;
  family: StrategyRefreshArtifactFamily;
  label: string;
  phaseHint: StrategyArtifactPhaseHint;
  data: unknown;
  promptContext: string;
}

export interface ResolveSelectedStrategyArtifactContextInput {
  selectedArtifactId: string | null;
  insightsData: InsightsCardData | null;
  manifestoData: ManifestoData | null;
  personaData: PersonaData[] | null;
  journeyMapData: JourneyMapData[] | null;
  keyFeaturesData: KeyFeaturesData | null;
  userFlowsData: UserFlow[] | null;
}

function buildContext(params: {
  artifactId: string;
  family: StrategyRefreshArtifactFamily;
  label: string;
  phaseHint: StrategyArtifactPhaseHint;
  data: unknown;
}): SelectedStrategyArtifactContext {
  const { artifactId, family, label, phaseHint, data } = params;

  return {
    artifactId,
    family,
    label,
    phaseHint,
    data,
    promptContext: [
      "## Selected Strategy Artifact (Primary Target)",
      "The user single-clicked this canvas artifact and expects this request to update it first.",
      "If dependent artifacts must change to keep the strategy consistent, update only the minimum necessary downstream artifacts.",
      `Artifact ID: ${artifactId}`,
      `Artifact Label: ${label}`,
      `Artifact Family: ${family}`,
      `Suggested Phase: ${phaseHint}`,
      "",
      JSON.stringify(data, null, 2),
    ].join("\n"),
  };
}

export function resolveSelectedStrategyArtifactContext(
  input: ResolveSelectedStrategyArtifactContextInput,
): SelectedStrategyArtifactContext | null {
  const {
    selectedArtifactId,
    insightsData,
    manifestoData,
    personaData,
    journeyMapData,
    keyFeaturesData,
    userFlowsData,
  } = input;

  if (!selectedArtifactId) return null;

  if (selectedArtifactId === "insights" && insightsData) {
    return buildContext({
      artifactId: selectedArtifactId,
      family: "insights",
      label: "Key Insights",
      phaseHint: "problem-overview",
      data: insightsData,
    });
  }

  if (selectedArtifactId === "product-overview" && manifestoData) {
    return buildContext({
      artifactId: selectedArtifactId,
      family: "overview",
      label: manifestoData.title ? `Overview: ${manifestoData.title}` : "Product Overview",
      phaseHint: "problem-overview",
      data: manifestoData,
    });
  }

  const personaMatch = selectedArtifactId.match(/^persona-(\d+)$/);
  if (personaMatch) {
    const index = Number(personaMatch[1]);
    const persona = personaData?.[index];
    if (!persona) return null;

    return buildContext({
      artifactId: selectedArtifactId,
      family: "personas",
      label: persona.name ? `Persona: ${persona.name}` : `Persona ${index + 1}`,
      phaseHint: "problem-overview",
      data: { index, persona },
    });
  }

  const journeyMatch = selectedArtifactId.match(/^journey-(\d+)$/);
  if (journeyMatch) {
    const index = Number(journeyMatch[1]);
    const journeyMap = journeyMapData?.[index];
    if (!journeyMap) return null;

    return buildContext({
      artifactId: selectedArtifactId,
      family: "journey-maps",
      label: journeyMap.personaName
        ? `Journey Map: ${journeyMap.personaName}`
        : `Journey Map ${index + 1}`,
      phaseHint: "problem-overview",
      data: { index, journeyMap },
    });
  }

  if (selectedArtifactId === "key-features" && keyFeaturesData) {
    return buildContext({
      artifactId: selectedArtifactId,
      family: "features",
      label: keyFeaturesData.ideaTitle
        ? `Key Features: ${keyFeaturesData.ideaTitle}`
        : "Key Features",
      phaseHint: "solution-design",
      data: keyFeaturesData,
    });
  }

  if (userFlowsData) {
    const flowIndex = userFlowsData.findIndex(
      (flow, index) => `user-flow-${flow.id ?? index}` === selectedArtifactId,
    );
    if (flowIndex >= 0) {
      const flow = userFlowsData[flowIndex];
      return buildContext({
        artifactId: selectedArtifactId,
        family: "user-flows",
        label: flow.jtbdText
          ? `User Flow: ${flow.jtbdText}`
          : `User Flow ${flowIndex + 1}`,
        phaseHint: "solution-design",
        data: { index: flowIndex, flow },
      });
    }
  }

  return null;
}
