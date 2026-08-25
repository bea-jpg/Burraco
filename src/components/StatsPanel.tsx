import React, { useEffect, useRef } from 'react';

interface StatsPanelProps {
  roundNumber: number;
  score1: number;
  score2: number;
  currentPlayerName: string;
  turnPhase: 'draw' | 'play';
  history: string[];
  onExit: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
  roundNumber,
  score1,
  score2,
  currentPlayerName,
  turnPhase,
  history,
  onExit
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [history]);

  // Colorazione intelligente dei log
  const getLogStyle = (log: string): string => {
    if (log.includes("CHIUSO") || log.includes("pozzetto")) {
      return "text-amber-400 font-bold tracking-wide border-b border-amber-500/20 pb-1 mb-1";
    }
    if (log.startsWith("Tu") || log.startsWith("Hai")) {
      return "text-emerald-400 font-semibold";
    }
    if (log.startsWith("Bot 3")) {
      return "text-sky-400";
    }
    if (log.startsWith("Bot 2") || log.startsWith("Bot 4")) {
      return "text-rose-400";
    }
    return "text-slate-300";
  };

  return (
    <div className="w-60 h-full bg-slate-950 flex flex-col p-4 border-l border-slate-900 select-none text-slate-200">
      {/* Box Statistiche */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-4 mb-4 shadow-lg">
        <h4 className="text-amber-500 font-black text-[11px] tracking-wider uppercase mb-3 border-b border-slate-800 pb-1.5">
          Statistiche Partita
        </h4>
        
        <div className="space-y-2.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Round corrente:</span>
            <span className="font-extrabold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">{roundNumber}</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Squadra 1 (Noi):</span>
            <span className="font-black text-emerald-400">{score1} pt</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Squadra 2 (Bot):</span>
            <span className="font-black text-rose-400">{score2} pt</span>
          </div>

          <div className="border-t border-slate-800/80 pt-2.5 flex flex-col items-start leading-snug">
            <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Stato Turno:</span>
            <span className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              {currentPlayerName} ({turnPhase.toUpperCase()})
            </span>
          </div>
        </div>
      </div>

      {/* Cronologia Giocate */}
      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-3 flex flex-col min-h-0 mb-4 shadow-lg">
        <h4 className="text-slate-400 font-black text-[10px] tracking-wider uppercase mb-2">
          Cronologia Giocate
        </h4>
        
        {/* Container scrollabile in X e Y */}
        <div
          ref={logContainerRef}
          className="flex-1 overflow-auto bg-slate-950/80 rounded-xl p-2.5 space-y-1.5 text-[11px] font-medium leading-relaxed custom-scrollbar"
        >
          {history.map((log, idx) => (
            <div key={idx} className={`whitespace-nowrap ${getLogStyle(log)}`}>
              • {log}
            </div>
          ))}
        </div>
      </div>

      {/* Uscita */}
      <button
        onClick={onExit}
        className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex-shrink-0"
      >
        Torna al Menù
      </button>
    </div>
  );
};
