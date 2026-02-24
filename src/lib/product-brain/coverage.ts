import type {
  ProductBrainData,
  JtbdCoverage,
  PersonaCoverage,
  JourneyStageCoverage,
  CoverageSummary,
} from "./types";
import type {
  ManifestoData,
  PersonaData,
  JourneyMapData,
} from "@/hooks/useStrategyStore";

/**
 * Computes a CoverageSummary from the product brain connections and strategy data.
 * Pure function — no side effects.
 */
export function computeCoverage(
  brain: ProductBrainData,
  manifesto: ManifestoData,
  personas: PersonaData[],
  journeyMaps: JourneyMapData[]
): CoverageSummary {
  const allConnections = brain.pages.flatMap((p) => p.connections);

  // --- JTBD Coverage ---
  const jtbdCoverage: JtbdCoverage[] = manifesto.jtbd.map((text, index) => {
    const matching = allConnections.filter((c) =>
      Array.isArray(c.jtbdIndices) && c.jtbdIndices.includes(index)
    );
    return {
      index,
      text,
      addressed: matching.length > 0,
      addressedBy: matching.map((c) => ({
        pageId: c.pageId,
        componentDescription: c.componentDescription,
      })),
    };
  });

  const addressedJtbdCount = jtbdCoverage.filter((j) => j.addressed).length;
  const totalJtbds = jtbdCoverage.length;

  // --- Persona Coverage ---
  const personaCoverage: PersonaCoverage[] = personas.map((persona) => {
    // Count how many unique JTBDs have connections referencing this persona
    const personaConnections = allConnections.filter((c) =>
      Array.isArray(c.personaNames) && c.personaNames.includes(persona.name)
    );
    const coveredJtbdIndices = new Set(
      personaConnections.flatMap((c) => c.jtbdIndices ?? [])
    );
    const addressedJtbds = coveredJtbdIndices.size;
    const coveragePercent =
      totalJtbds > 0 ? Math.round((addressedJtbds / totalJtbds) * 100) : 0;

    return {
      personaName: persona.name,
      coveragePercent,
      addressedJtbds,
      totalJtbds,
    };
  });

  // --- Journey Stage Coverage ---
  const journeyStageCoverage: JourneyStageCoverage[] = journeyMaps.flatMap(
    (map) =>
      (map.stages ?? []).map((stage, stageIndex) => {
        const covered = allConnections.some((c) =>
          c.journeyStages?.some(
            (js) =>
              js.personaName === map.personaName &&
              js.stageIndex === stageIndex
          )
        );
        return {
          personaName: map.personaName,
          stageIndex,
          stageName: stage.stage,
          covered,
        };
      })
  );

  // --- Overall ---
  const overallPercent =
    totalJtbds > 0 ? Math.round((addressedJtbdCount / totalJtbds) * 100) : 0;

  // --- Gaps ---
  const gaps = jtbdCoverage
    .filter((j) => !j.addressed)
    .map((j) => `JTBD #${j.index + 1}: "${j.text}"`);

  return {
    overallPercent,
    jtbdCoverage,
    personaCoverage,
    journeyStageCoverage,
    gaps,
  };
}
