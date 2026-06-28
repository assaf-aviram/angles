import { useSelector } from "react-redux";
import { StarIcon } from "@heroicons/react/24/solid";
import { selectCurrentImages } from "../store/sessionsSlice";
import { sessionAngleStats, sessionMainIndex } from "../lib/angles";

const deg = (d) => `${d.toFixed(1)}°`;

export const SessionSummary = () => {
  const images = useSelector(selectCurrentImages);
  const rows = sessionAngleStats(images);
  const mainIndex = sessionMainIndex(images);

  if (rows.length === 0) return null;

  return (
    <div className="mb-5 rounded-lg border border-white/10 bg-gray-800/60 p-4">
      <h3 className="mb-3 text-sm font-semibold text-white">
        Angle ranges across this session
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const isMain = r.index === mainIndex;
          return (
            <div
              key={r.index}
              className={`rounded-md p-3 ${
                isMain ? "bg-emerald-500/10 ring-1 ring-emerald-400/40" : "bg-white/5"
              }`}
            >
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-300">
                {isMain && <StarIcon className="size-3.5 text-emerald-400" />}
                Vertex {r.index + 1}
                <span className="ml-auto text-gray-500">{r.count} frames</span>
              </div>
              <div className="flex items-baseline justify-between font-mono">
                <Stat label="flexion" value={deg(r.min)} tone="text-sky-300" />
                <Stat label="extension" value={deg(r.max)} tone="text-amber-300" />
                <Stat label="ROM" value={deg(r.range)} tone="text-white" />
              </div>
              <div className="mt-1 text-right text-xs text-gray-500">
                avg {deg(r.mean)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone }) => (
  <div className="text-center">
    <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    <div className="text-[10px] tracking-wide text-gray-400 uppercase">
      {label}
    </div>
  </div>
);
