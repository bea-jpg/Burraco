import React from "react";
import type { Meld } from "../utils/gameEngine";
import { CardView } from "./CardView";

interface MeldRowProps {
  teamId: number;
  melds: Meld[];
  titleColorClass: string;
  teamLabel: string;
  points: number;
  onMeldClick?: (meldIdx: number) => void;
  lastUpdatedMeld: [number, number] | null;
  actionButton?: React.ReactNode;
}

export const MeldRow: React.FC<MeldRowProps> = ({
  teamId,
  melds,
  titleColorClass,
  teamLabel,
  points,
  onMeldClick,
  lastUpdatedMeld,
  actionButton,
}) => {
  const cardSpacing = 16;
  const cardHeight = 52; // mini is w-9 h-13 (36px x 52px)
  const cardWidth = 36;

  return (
    <div className="flex flex-col w-full h-full select-none">
      {/* Header compatto con eventuale pulsante azione */}
      <div className={`flex items-center justify-between px-3 py-1 ${titleColorClass} bg-slate-950/90 border-b border-slate-900/80 shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest">{teamLabel}</span>
          <span className="text-[8.5px] font-bold text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{points} PT</span>
        </div>
        {actionButton && <div>{actionButton}</div>}
      </div>

      {/* Lista calate scrollabile orizzontalmente con carte a cascata verticale */}
      <div
        className="flex-1 flex flex-row gap-2.5 overflow-x-auto overflow-y-auto px-3 py-2 scrollbar-none items-start"
        style={{ scrollbarWidth: "none" }}
      >
        {melds.length === 0 ? (
          <div className="flex items-center justify-center w-full h-full min-h-[70px] text-slate-600 text-[10px] italic tracking-wider">
            Nessuna calata ancora
          </div>
        ) : (
          melds.map((meld, idx) => {
            const isHighlighted =
              lastUpdatedMeld !== null &&
              lastUpdatedMeld[0] === teamId &&
              lastUpdatedMeld[1] === idx;

            const totalStackHeight = (meld.cards.length - 1) * cardSpacing + cardHeight;

            return (
              <div
                key={meld.id}
                onClick={() => onMeldClick && onMeldClick(idx)}
                className={[
                  "flex-shrink-0 flex flex-col items-center rounded-xl border cursor-pointer",
                  "transition-all duration-200 active:scale-95 shadow-md",
                  isHighlighted
                    ? "border-amber-400 bg-slate-900/90 shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-1 ring-amber-400"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60",
                ].join(" ")}
                style={{ padding: "4px 4px 8px 4px" }}
              >
                {/* Header della calata */}
                <div className="flex items-center justify-between w-full mb-1 px-0.5 gap-1">
                  <span className="text-[7.5px] font-black text-slate-400 uppercase leading-none">
                    {meld.type === "run" ? "⚡Scal." : "⚔️Grup."}
                  </span>
                  <span
                    className={`text-[7px] font-black uppercase leading-none px-1 py-0.5 rounded ${
                      meld.clean
                        ? "text-emerald-400 bg-emerald-950/60 border border-emerald-800/40"
                        : "text-amber-400 bg-amber-950/60 border border-amber-800/40"
                    }`}
                  >
                    {meld.clean ? "PUL" : "SPO"}
                  </span>
                </div>

                {/* Carte a cascata verticale */}
                <div
                  className="relative"
                  style={{
                    width: `${cardWidth}px`,
                    height: `${totalStackHeight}px`,
                  }}
                >
                  {meld.cards.map((card, cIdx) => (
                    <div
                      key={card.id}
                      className="absolute transition-transform duration-150 hover:-translate-y-1 hover:z-50"
                      style={{ top: `${cIdx * cardSpacing}px`, zIndex: cIdx }}
                    >
                      <CardView card={card} size="mini" />
                    </div>
                  ))}

                  {/* Badge Burraco se >= 7 carte */}
                  {meld.cards.length >= 7 && (
                    <div
                      className={[
                        "absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[7px] font-black px-1.5 py-0.5 rounded-full border border-white/20 text-white shadow-xl z-30 whitespace-nowrap",
                        meld.clean
                          ? "bg-gradient-to-r from-emerald-600 to-teal-500 shadow-emerald-900/50"
                          : "bg-gradient-to-r from-amber-600 to-orange-500 shadow-amber-900/50",
                      ].join(" ")}
                    >
                      {meld.clean ? "🏆 BURRACO" : "⚡ BUR. SPO"}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
