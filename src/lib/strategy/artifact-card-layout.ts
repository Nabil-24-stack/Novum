const ARTIFACT_SHELL_HORIZONTAL_PADDING = 32 * 2;
const ARTIFACT_GRID_GAP = 16;

const PERSONAS_MAX_COLUMNS = 3;
const PERSONAS_COLUMN_WIDTH = (1040 - ARTIFACT_SHELL_HORIZONTAL_PADDING - ARTIFACT_GRID_GAP * 2) / 3;
const PERSONAS_ROW_ESTIMATED_HEIGHT = 420;

const OPPORTUNITY_MAP_MAX_COLUMNS = 3;
const OPPORTUNITY_MAP_COLUMN_WIDTH =
  (940 - ARTIFACT_SHELL_HORIZONTAL_PADDING - ARTIFACT_GRID_GAP * 2) / 3;
const OPPORTUNITY_MAP_ROW_ESTIMATED_HEIGHT = 260;
const OPPORTUNITY_MAP_MIN_HEIGHT = 520;

function resolveColumns(count: number, maxColumns: number): number {
  return Math.max(1, Math.min(count, maxColumns));
}

function resolveCardWidth(columnCount: number, columnWidth: number): number {
  return (
    ARTIFACT_SHELL_HORIZONTAL_PADDING +
    columnCount * columnWidth +
    Math.max(0, columnCount - 1) * ARTIFACT_GRID_GAP
  );
}

export function getPersonasColumnCount(personaCount: number): number {
  return resolveColumns(personaCount, PERSONAS_MAX_COLUMNS);
}

export function getOpportunityMapColumnCount(personaCount: number): number {
  return resolveColumns(personaCount, OPPORTUNITY_MAP_MAX_COLUMNS);
}

export function getPersonasCardWidth(personaCount: number): number {
  return resolveCardWidth(getPersonasColumnCount(personaCount), PERSONAS_COLUMN_WIDTH);
}

export function getOpportunityMapCardWidth(personaCount: number): number {
  return resolveCardWidth(
    getOpportunityMapColumnCount(personaCount),
    OPPORTUNITY_MAP_COLUMN_WIDTH,
  );
}

export function getPersonasGroupHeight(personaCount: number): number {
  const rows = Math.max(1, Math.ceil(personaCount / PERSONAS_MAX_COLUMNS));
  return rows * PERSONAS_ROW_ESTIMATED_HEIGHT;
}

export function getOpportunityMapGroupHeight(personaCount: number): number {
  const rows = Math.max(1, Math.ceil(personaCount / OPPORTUNITY_MAP_MAX_COLUMNS));
  return Math.max(OPPORTUNITY_MAP_MIN_HEIGHT, rows * OPPORTUNITY_MAP_ROW_ESTIMATED_HEIGHT);
}

export const artifactCardLayout = {
  gridGap: ARTIFACT_GRID_GAP,
  personas: {
    columnWidth: PERSONAS_COLUMN_WIDTH,
  },
  opportunityMap: {
    columnWidth: OPPORTUNITY_MAP_COLUMN_WIDTH,
  },
} as const;
