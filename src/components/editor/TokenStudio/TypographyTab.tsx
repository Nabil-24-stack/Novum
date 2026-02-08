"use client";

interface TypographyTabProps {
  baseSize: number;
  scaleRatio: number;
  onUpdateBaseSize: (size: number) => void;
  onUpdateScaleRatio: (ratio: number) => void;
}

const SCALE_NAMES: Record<string, string> = {
  "1.1": "Minor Second",
  "1.125": "Major Second",
  "1.15": "",
  "1.2": "Minor Third",
  "1.25": "Major Third",
  "1.3": "",
  "1.333": "Perfect Fourth",
  "1.35": "",
  "1.4": "",
  "1.414": "Aug. Fourth",
  "1.45": "",
  "1.5": "Perfect Fifth",
};

function getScaleLabel(ratio: number): string {
  const key = String(ratio);
  return SCALE_NAMES[key] ?? "";
}

const LEVELS: { name: string; label: string; step: number }[] = [
  { name: "text-h1", label: "Heading 1", step: 4 },
  { name: "text-h2", label: "Heading 2", step: 3 },
  { name: "text-h3", label: "Heading 3", step: 2 },
  { name: "text-h4", label: "Heading 4", step: 1 },
  { name: "text-body", label: "Body", step: 0 },
  { name: "text-body-sm", label: "Body Small", step: -1 },
  { name: "text-caption", label: "Caption", step: -2 },
];

export function TypographyTab({
  baseSize,
  scaleRatio,
  onUpdateBaseSize,
  onUpdateScaleRatio,
}: TypographyTabProps) {
  const scaleLabel = getScaleLabel(scaleRatio);

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Scale
        </h4>

        {/* Base Size */}
        <div className="bg-neutral-50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Base Size</span>
            <span className="text-sm font-mono text-neutral-500">
              {baseSize}px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">14</span>
            <input
              type="range"
              min="14"
              max="20"
              step="1"
              value={baseSize}
              onChange={(e) => onUpdateBaseSize(parseInt(e.target.value))}
              className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
            />
            <span className="text-sm text-neutral-400">20</span>
          </div>
        </div>

        {/* Scale Ratio */}
        <div className="mt-3 bg-neutral-50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Scale Ratio</span>
            <span className="text-sm font-mono text-neutral-500">
              {scaleRatio.toFixed(2)}
              {scaleLabel && (
                <span className="text-neutral-400 ml-1">({scaleLabel})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">1.1</span>
            <input
              type="range"
              min="1.1"
              max="1.5"
              step="0.05"
              value={scaleRatio}
              onChange={(e) => onUpdateScaleRatio(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
            />
            <span className="text-sm text-neutral-400">1.5</span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Preview
        </h4>
        <div className="bg-neutral-50 rounded-lg p-3 space-y-1">
          {LEVELS.map(({ name, label, step }) => {
            const sizePx = baseSize * Math.pow(scaleRatio, step);
            const isBase = step === 0;
            return (
              <div
                key={name}
                className={`flex items-baseline gap-3 py-1.5 ${
                  isBase ? "bg-neutral-100 -mx-2 px-2 rounded" : ""
                }`}
              >
                <span className="text-sm font-mono text-neutral-400 w-24 shrink-0">
                  {name.replace("text-", "")}
                </span>
                <span className="text-sm font-mono text-neutral-500 w-14 shrink-0 text-right">
                  {sizePx.toFixed(1)}px
                </span>
                <span
                  className="text-neutral-800 truncate"
                  style={{ fontSize: `${sizePx}px`, lineHeight: 1.3 }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
