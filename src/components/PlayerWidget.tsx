import React from 'react';

interface PlayerWidgetProps {
  name: string;
  role: string;
  cardCount: number;
  isActive: boolean;
}

export const PlayerWidget: React.FC<PlayerWidgetProps> = ({
  name,
  role,
  cardCount,
  isActive
}) => {
  return (
    <div className="relative select-none scale-100 transition-all duration-300">
      {/* Indicatore "In Turno" in alto */}
      {isActive && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-extrabold text-[8px] tracking-widest px-2 py-0.5 rounded-full shadow-[0_4px_10px_rgba(245,158,11,0.4)] border border-amber-300 animate-pulse z-20 whitespace-nowrap">
          ★ IN TURNO ★
        </div>
      )}

      {/* Box Principale Widget Verticale Compatto per evitare collisioni di layout */}
      <div
        className={`
          flex flex-col items-center justify-center p-2 w-28 h-22 rounded-xl transition-all duration-300 relative border
          ${isActive 
            ? 'bg-slate-900/90 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.35)] ring-1 ring-amber-400/30 scale-105' 
            : 'bg-slate-900/60 backdrop-blur-sm border-slate-800 shadow-md'}
        `}
      >
        {isActive && (
          <div className="absolute inset-0 bg-radial-gradient from-amber-500/10 to-transparent rounded-xl pointer-events-none" />
        )}

        {/* Informazioni Giocatore Centrate */}
        <div className="text-center leading-tight z-10 w-full overflow-hidden mb-1">
          <div className={`text-[11px] font-black tracking-wide truncate ${isActive ? 'text-amber-400' : 'text-white'}`}>
            {name}
          </div>
          <div className="text-[8px] text-slate-400 font-medium truncate mt-0.5">
            {role}
          </div>
        </div>

        {/* Icona mazzetto 3D con contatore in basso */}
        <div className="relative w-8 h-10 z-10 select-none flex-shrink-0">
          {/* Ombra mazzetto */}
          <div className="absolute top-[1.5px] left-[1.5px] w-8 h-10 bg-slate-950 rounded-[4px] pointer-events-none" />
          
          {/* Carta coperta mazzetto */}
          <div className="w-8 h-10 rounded-[4px] bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 border border-amber-500/30 relative flex items-center justify-center shadow-md">
            <div className="absolute inset-[2px] border-[0.5px] border-amber-500/10 rounded-[2px]" />
            <span className="text-amber-400 font-black text-[9px] z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{cardCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
