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
  // Flatten connections, carrying the parent page's pageId onto each connection
  // (the AI JSON has pageId at the PageDecisions level, not per-connection)
  const allConnections = (brain.pages ?? []).flatMap((p) =>
    p.connections.map((c) => ({ ...c, pageId: c.pageId || p.pageId }))
  );

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
        connectionId: c.id,
        personaNames: c.personaNames,
        rationale: c.rationale,
        insightIndices: c.insightIndices,
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
  // When personas exist, overall should reflect coverage across ALL personas,
  // not just whether any single connection references a JTBD.
  let overallPercent: number;
  if (personaCoverage.length > 0) {
    const avgCoverage =
      personaCoverage.reduce((sum, p) => sum + p.coveragePercent, 0) /
      personaCoverage.length;
    overallPercent = Math.round(avgCoverage);
  } else {
    overallPercent =
      totalJtbds > 0 ? Math.round((addressedJtbdCount / totalJtbds) * 100) : 0;
  }

  // --- Gaps ---
  const gaps: string[] = [];
  if (personaCoverage.length > 0) {
    // Per-persona gaps: JTBDs not covered for a specific persona
    personas.forEach((persona) => {
      const personaConns = allConnections.filter(
        (c) =>
          Array.isArray(c.personaNames) && c.personaNames.includes(persona.name)
      );
      const coveredIndices = new Set(
        personaConns.flatMap((c) => c.jtbdIndices ?? [])
      );
      manifesto.jtbd.forEach((text, index) => {
        if (!coveredIndices.has(index)) {
          gaps.push(`${persona.name}: JTBD #${index + 1} — "${text}"`);
        }
      });
    });
  } else {
    jtbdCoverage
      .filter((j) => !j.addressed)
      .forEach((j) => gaps.push(`JTBD #${j.index + 1}: "${j.text}"`));
  }

  return {
    overallPercent,
    jtbdCoverage,
    personaCoverage,
    journeyStageCoverage,
    gaps,
  };
}
