import React from 'react';
import type { Meld } from '../utils/gameEngine';
import { CardView } from './CardView';

interface MeldColumnProps {
  title: string;
  teamId: number;
  melds: Meld[];
  titleColorClass: string;
  onMeldClick?: (meldIdx: number) => void;
  buttonText?: string;
  onButtonClick?: () => void;
  isButtonDisabled?: boolean;
  lastUpdatedMeld: [number, number] | null; // [teamId, meldIdx]
  points: number;
}

export const MeldColumn: React.FC<MeldColumnProps> = ({
  title,
  teamId,
  melds,
  titleColorClass,
  onMeldClick,
  buttonText,
  onButtonClick,
  isButtonDisabled = false,
  lastUpdatedMeld,
  points
}) => {
  return (
    <div className="flex flex-col w-[360px] h-full bg-slate-950/90 backdrop-blur-sm border-r border-slate-900 border-l select-none shadow-xl">
      {/* Intestazione Colonna con Punteggio Integrato */}
      <div className="w-full bg-slate-950/95 text-center py-4 border-b border-slate-900 shadow-sm flex flex-col items-center justify-center gap-0.5">
        <h3 className={`font-black text-xs tracking-widest uppercase ${titleColorClass}`}>{title}</h3>
        <span className="text-[10px] font-black text-slate-400 tracking-wider bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{points} PT</span>
      </div>

      {/* Lista Calate Scrollabile (Grid a 2 colonne per evitare scroll verticale) */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 content-start custom-scrollbar">
        {melds.length === 0 ? (
          <div className="col-span-2 h-full flex items-center justify-center text-slate-600 text-xs italic text-center px-4 py-12">
            Nessuna calata attiva
          </div>
        ) : (
          melds.map((meld, idx) => {
            const isHighlighted = lastUpdatedMeld !== null && lastUpdatedMeld[0] === teamId && lastUpdatedMeld[1] === idx;
            
            return (
              <div
                key={meld.id}
                onClick={() => onMeldClick && onMeldClick(idx)}
                className={`
                  p-2.5 rounded-xl cursor-pointer transition-all duration-300 border
                  ${isHighlighted 
                    ? 'bg-slate-900 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)] scale-[1.02]' 
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/80 hover:-translate-y-0.5'}
                `}
              >
                {/* Info riga meld */}
                <div className="flex items-center justify-between mb-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                  <span>{meld.type === 'run' ? '⚡ Scala' : '⚔️ Gruppo'}</span>
                  <span className={meld.clean ? 'text-emerald-400' : 'text-amber-500'}>
                    {meld.clean ? 'Pulito' : 'Sporco'}
                  </span>
                </div>

                {/* Carte Fanned (Ingrandite a normal) */}
                <div className="relative h-22 w-full flex items-center overflow-visible pl-1.5">
                  {meld.cards.map((card, cIdx) => (
                    <div
                      key={card.id}
                      className="absolute transition-transform duration-200 hover:-translate-y-2 hover:z-50"
                      style={{ left: `${cIdx * 15}px`, zIndex: cIdx }}
                    >
                      <CardView card={card} size="normal" />
                    </div>
                  ))}
                  
                  {/* Badge Burraco (se >= 7 carte) */}
                  {meld.cards.length >= 7 && (
                    <div 
                      className={`
                        absolute right-1 bottom-1 text-[8px] font-black px-1.5 py-0.5 rounded border border-white/10 text-white shadow-xl z-30 tracking-widest
                        ${meld.clean ? 'bg-gradient-to-r from-emerald-600 to-teal-500' : 'bg-gradient-to-r from-amber-600 to-orange-500'}
                      `}
                    >
                      {meld.clean ? 'PULITO' : 'SPORCO'}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottone a fondo colonna (opzionale) */}
      {buttonText && onButtonClick && (
        <div className="p-3 border-t border-slate-900 bg-slate-950/90 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
          <button
            onClick={() => {
              if (isButtonDisabled) {
                alert("Devi prima PESCARE una carta dal mazzo o dagli scarti per poter calare!");
                return;
              }
              onButtonClick();
            }}
            className={`w-full py-3 font-extrabold text-[11px] tracking-widest rounded-xl transition-all uppercase
              ${isButtonDisabled 
                ? 'bg-slate-800/80 border border-slate-700/50 text-slate-500 cursor-pointer opacity-70' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-95 text-white shadow-lg shadow-emerald-950/40'
              }
            `}
          >
            {buttonText}
          </button>
        </div>
      )}
    </div>
  );
};
