"use client";

interface SpacingTabProps {
  baseUnit: number;
  onUpdateBaseUnit: (unit: number) => void;
}

function getDensityLabel(unit: number): string {
  if (unit < 3.5) return "Tight";
  if (unit <= 4.5) return "Standard";
  if (unit <= 5.5) return "Comfortable";
  return "Spacious";
}

const SAMPLE_UTILITIES = [
  { name: "p-4", multiplier: 4 },
  { name: "gap-6", multiplier: 6 },
  { name: "m-8", multiplier: 8 },
  { name: "w-16", multiplier: 16 },
];

const VISUAL_SQUARES = [
  { name: "w-12", multiplier: 12 },
  { name: "w-16", multiplier: 16 },
  { name: "w-24", multiplier: 24 },
];

export function SpacingTab({ baseUnit, onUpdateBaseUnit }: SpacingTabProps) {
  const densityLabel = getDensityLabel(baseUnit);

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Density
        </h4>

        {/* Base Unit */}
        <div className="bg-neutral-50 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base text-neutral-700">Base Unit</span>
            <span className="text-sm font-mono text-neutral-500">
              {baseUnit}px
              <span className="text-neutral-400 ml-1">({densityLabel})</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">2</span>
            <input
              type="range"
              min="2"
              max="8"
              step="0.5"
              value={baseUnit}
              onChange={(e) => onUpdateBaseUnit(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-800"
            />
            <span className="text-sm text-neutral-400">8</span>
          </div>
        </div>
      </div>

      {/* Utility Preview */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Computed Values
        </h4>
        <div className="bg-neutral-50 rounded-lg p-3 space-y-2">
          {SAMPLE_UTILITIES.map(({ name, multiplier }) => {
            const px = baseUnit * multiplier;
            return (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm font-mono text-neutral-600">{name}</span>
                <span className="text-sm font-mono text-neutral-400">
                  {px}px
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Comparison */}
      <div>
        <h4 className="text-sm font-medium text-neutral-400 uppercase tracking-wide mb-3">
          Visual Scale
        </h4>
        <div className="bg-neutral-50 rounded-lg p-3">
          <div className="flex items-end gap-3">
            {VISUAL_SQUARES.map(({ name, multiplier }) => {
              const size = baseUnit * multiplier;
              return (
                <div key={name} className="flex flex-col items-center gap-1">
                  <div
                    className="bg-neutral-300 rounded"
                    style={{ width: `${size}px`, height: `${size}px` }}
                  />
                  <span className="text-xs font-mono text-neutral-400">
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
