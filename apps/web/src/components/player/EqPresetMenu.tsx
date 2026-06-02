import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { usePlayerStore, type EqPreset } from "@/store/playerStore";

const PRESETS: { id: EqPreset; label: string; hint: string }[] = [
  { id: "off", label: "Flat", hint: "Original mix" },
  { id: "bass", label: "Bass boost", hint: "Extra ♂️ low end" },
  { id: "dungeon", label: "Dungeon", hint: "Bass + presence for gachi" },
];

export function EqPresetMenu() {
  const eqPreset = usePlayerStore((s) => s.eqPreset);
  const setEqPreset = usePlayerStore((s) => s.setEqPreset);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn-icon touch-target ${eqPreset !== "off" ? "text-spotify-green" : "text-white/70"}`}
        aria-label="Equalizer"
        title="EQ / bass boost"
      >
        <SlidersHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close EQ"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full right-0 z-50 mb-2 w-48 rounded-lg bg-spotify-elevated p-2 shadow-xl">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setEqPreset(p.id);
                  setOpen(false);
                }}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-white/10 ${
                  eqPreset === p.id ? "text-spotify-green" : ""
                }`}
              >
                <span className="font-semibold">{p.label}</span>
                <span className="mt-0.5 block text-xs text-spotify-muted">{p.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
