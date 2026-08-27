import React from 'react';
import type { Card } from '../types/card';

interface CardViewProps {
  card: Card | null; // null represents card back
  onClick?: () => void;
  size?: 'normal' | 'mini' | 'micro';
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  onClick,
  size = 'normal'
}) => {
  // Dimensionamento dinamico
  let widthClass = 'w-14 h-20';
  let innerPadding = 'p-1';
  let fontValue = 'text-[11px]';
  let fontSuitMini = 'text-[9px]';
  let fontSuitCenter = 'text-[24px]';
  let radiusClass = 'rounded-md';
  let borderClass = 'border';
  
  if (size === 'mini') {
    widthClass = 'w-11 h-16';
    innerPadding = 'p-0.5';
    fontValue = 'text-[9.5px]';
    fontSuitMini = 'text-[7.5px]';
    fontSuitCenter = 'text-[18px]';
    radiusClass = 'rounded-[5px]';
    borderClass = 'border-[0.8px]';
  } else if (size === 'micro') {
    widthClass = 'w-7 h-10';
    innerPadding = 'p-0.5';
    fontValue = 'text-[6px]';
    fontSuitMini = 'text-[0px]';
    fontSuitCenter = 'text-[10px]';
    radiusClass = 'rounded-[2px]';
    borderClass = 'border-[0.5px]';
  }

  // Se è un dorso coperto (Royal Casino Gold-Lattice Ornate Back)
  if (!card) {
    return (
      <div
        className={`
          ${widthClass} ${radiusClass} ${borderClass} relative cursor-pointer select-none 
          border-[#d4af37]/60 bg-[#0c1a30] 
          shadow-[4px_4px_8px_rgba(0,0,0,0.65)] flex items-center justify-center
          transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-95
        `}
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, #d4af37 1px, transparent 1px),
            linear-gradient(45deg, transparent 48%, #d4af37 49%, #d4af37 51%, transparent 52%),
            linear-gradient(-45deg, transparent 48%, #d4af37 49%, #d4af37 51%, transparent 52%)
          `,
          backgroundSize: '8px 8px, 12px 12px, 12px 12px',
          backgroundBlendMode: 'normal'
        }}
        onClick={onClick}
      >
        {/* Ornato geometrico interno e cornice dorati */}
        <div className={`absolute inset-[3px] border-[0.7px] border-[#d4af37]/50 ${radiusClass}`} />
        <div className={`absolute inset-[5px] border-[0.3px] border-[#d4af37]/20 ${radiusClass} opacity-60`} />
        
        {/* Stemma centrale */}
        <div className="w-4 h-5 rounded-sm bg-[#0c1a30] border border-[#d4af37]/60 flex items-center justify-center z-10 shadow-sm">
          <span className="text-[#d4af37] font-black select-none text-[8px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">♢</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const textColor = card.isJoker ? 'text-[#d4af37]' : isRed ? 'text-[#c2185b]' : 'text-[#1e293b]';
  const innerBorderColor = isRed ? 'border-[#f8bbd0]/30' : 'border-slate-200/50';
  const displayRank = card.isJoker ? 'JK' : card.rank;
  const displaySuit = card.isJoker ? '★' : card.suit;

  return (
    <div
      onClick={onClick}
      className={`
        ${widthClass} ${radiusClass} ${borderClass} relative cursor-pointer select-none
        bg-gradient-to-b from-[#fffefe] to-[#f4ecd8] border-[#cdc2a5]
        shadow-[3px_3px_8px_rgba(0,0,0,0.45)] transition-all duration-200 ease-out flex flex-col justify-between
        ${textColor} ${innerPadding}
      `}
    >
      {/* Cornice interna decorativa sottile (Ivory Card Face Accent) */}
      <div className={`absolute inset-[2.5px] border-[0.5px] ${innerBorderColor} ${radiusClass} pointer-events-none`} />

      {/* Top Left Value & Suit */}
      {size !== 'micro' && (
        <div className="flex flex-col items-start leading-none z-10 pl-0.5 pt-0.5">
          <span className={`${fontValue} font-black tracking-tighter drop-shadow-[0_0.5px_0_rgba(255,255,255,0.8)]`}>{displayRank}</span>
          <span className={`${fontSuitMini} -mt-0.5 font-bold`}>{displaySuit}</span>
        </div>
      )}

      {/* Center Value */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`${fontSuitCenter} font-extrabold drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]`}>{displaySuit}</span>
      </div>

      {/* Bottom Right Value & Suit */}
      {size !== 'micro' && (
        <div className="flex flex-col items-end leading-none z-10 self-end rotate-180 pr-0.5 pb-0.5">
          <span className={`${fontValue} font-black tracking-tighter drop-shadow-[0_0.5px_0_rgba(255,255,255,0.8)]`}>{displayRank}</span>
          <span className={`${fontSuitMini} -mt-0.5 font-bold`}>{displaySuit}</span>
        </div>
      )}
    </div>
  );
};
