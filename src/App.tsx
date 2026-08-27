import React, { useState, useEffect, useRef } from 'react';
import { type GameState, createInitialState, getPlayerTeamId, drawFromDeck, takeDiscardPile, meldNewCombination, addToExistingMeld, discardCard, calculateRoundScores } from './utils/gameEngine';
import { chooseDrawAction, playSingleBotMeld, chooseBotDiscard } from './utils/botPlayer';
import { CardView } from './components/CardView';
import { MeldColumn } from './components/MeldColumn';
import { MeldRow } from './components/MeldRow';
import { PlayerWidget } from './components/PlayerWidget';

import { type Card } from './types/card';
import confetti from 'canvas-confetti';
import { Play, Award, CheckCircle } from 'lucide-react';

export default function App() {
  const [gameMode, setGameMode] = useState<'menu' | 'game'>('menu');
  const [gameState, setGameState] = useState<GameState>(() => createInitialState());
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [lastUpdatedMeld, setLastUpdatedMeld] = useState<[number, number] | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [showScoreModal, setShowScoreModal] = useState<boolean>(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [isPortrait, setIsPortrait] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
  const isBotRunningRef = useRef<boolean>(false);

  // Rilevamento orientamento portrait e mobile
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortrait(w < h);
      setIsMobile(w < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Avvio di una nuova partita
  const startNewGame = () => {
    setGameState(createInitialState(1, [0, 0]));
    setSelectedCardIds(new Set());
    setLastUpdatedMeld(null);
    setIsTransitioning(false);
    setShowScoreModal(false);
    setGameMode('game');
  };

  // Turno automatico dei Bot
  useEffect(() => {
    if (gameMode === 'menu' || gameState.roundOver) return;

    const activePlayerIdx = gameState.currentPlayerIdx;
    const isBot = activePlayerIdx !== 0;

    if (isBot) {
      if (isBotRunningRef.current) return;
      isBotRunningRef.current = true;
      setIsTransitioning(true);

      let currentTimer: any = null;

      // Gestione delle calate e delle aggiunte una alla volta in modo sequenziale
      const playStep = () => {
        if (!isBotRunningRef.current) return;
        
        let played = false;
        setGameState(prev => {
          const res = playSingleBotMeld(prev, activePlayerIdx);
          if (res.played) {
            played = true;
            const teamId = getPlayerTeamId(activePlayerIdx);
            if (res.changedMeldIdx !== null) {
              setLastUpdatedMeld([teamId, res.changedMeldIdx]);
            }
            return res.state;
          }
          return prev;
        });

        if (played) {
          // Se ha calato, aspetta 2.5 secondi e prova a giocare la prossima
          currentTimer = setTimeout(playStep, 2500);
        } else {
          // Altrimenti passa allo scarto dopo 2.5 secondi
          currentTimer = setTimeout(discardStep, 2500);
        }
      };

      const discardStep = () => {
        if (!isBotRunningRef.current) return;
        
        setGameState(prev => {
          const { card, isClosing } = chooseBotDiscard(prev, activePlayerIdx);
          const res = discardCard(prev, activePlayerIdx, card, isClosing);
          return res.state;
        });
        
        setIsTransitioning(false);
        isBotRunningRef.current = false;
      };

      // Step 1: Pesca / Raccolta
      currentTimer = setTimeout(() => {
        if (!isBotRunningRef.current) return;
        setGameState(prev => {
          const action = chooseDrawAction(prev, activePlayerIdx);
          if (action === 'deck') {
            return drawFromDeck(prev, activePlayerIdx);
          } else {
            return takeDiscardPile(prev, activePlayerIdx);
          }
        });

        // Passa al primo step di calata dopo 2.5 secondi
        currentTimer = setTimeout(playStep, 2500);
      }, 2500);

      return () => {
        clearTimeout(currentTimer);
        isBotRunningRef.current = false;
        setIsTransitioning(false);
      };
    }
  }, [gameState.currentPlayerIdx, gameState.roundOver, gameMode]);

  // Gestione fine round
  useEffect(() => {
    if (gameState.roundOver) {
      setShowScoreModal(true);
      confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
    }
  }, [gameState.roundOver]);

  // Gestione pescata umana
  const handleHumanDraw = () => {
    if (gameState.currentPlayerIdx !== 0 || gameState.turnPhase !== 'draw' || isTransitioning) return;
    setLastUpdatedMeld(null);
    setGameState(prev => drawFromDeck(prev, 0));
  };

  // Gestione raccolta scarti umana
  const handleHumanCollect = () => {
    if (gameState.currentPlayerIdx !== 0 || gameState.turnPhase !== 'draw' || isTransitioning) return;
    setLastUpdatedMeld(null);
    setGameState(prev => takeDiscardPile(prev, 0));
  };

  // Toggle selezione carte della mano
  const toggleCardSelect = (cardId: string) => {
    if (gameState.currentPlayerIdx !== 0 || isTransitioning) return;
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  // Calata nuova combinazione
  const handleNewMeld = () => {
    if (selectedCardIds.size === 0) return;
    const hand = gameState.hands[0];
    const selectedCards = hand.filter(card => selectedCardIds.has(card.id));
    
    const res = meldNewCombination(gameState, 0, selectedCards);
    if (res.success) {
      setGameState(res.state);
      setSelectedCardIds(new Set());
    } else {
      alert(res.msg);
    }
  };

  // Aggiunta a calata esistente
  const handleAddToMeld = (meldIdx: number) => {
    if (selectedCardIds.size === 0) return;
    const hand = gameState.hands[0];
    const selectedCards = hand.filter(card => selectedCardIds.has(card.id));
    
    const res = addToExistingMeld(gameState, 0, meldIdx, selectedCards);
    if (res.success) {
      setGameState(res.state);
      setSelectedCardIds(new Set());
    } else {
      alert(res.msg);
    }
  };

  // Scarto / Chiusura umana
  const handleDiscard = (card: Card) => {
    if (gameState.currentPlayerIdx !== 0 || gameState.turnPhase !== 'play' || isTransitioning) return;

    const res = discardCard(gameState, 0, card, false);
    if (res.success) {
      setGameState(res.state);
      setSelectedCardIds(new Set());
    } else if (res.msg === "CONFIRM_REQUIRED") {
      const confirmClose = window.confirm("Sei pronto a CHIUDERE il round con questo scarto?");
      if (confirmClose) {
        const resConfirm = discardCard(gameState, 0, card, true);
        if (resConfirm.success) {
          setGameState(resConfirm.state);
          setSelectedCardIds(new Set());
        }
      }
    } else {
      alert(res.msg);
    }
  };

  // Gestione clic sul monte degli scarti (pesca o scarta)
  const handleScartiClick = () => {
    if (gameState.currentPlayerIdx !== 0 || isTransitioning) return;
    if (gameState.turnPhase === 'draw') {
      handleHumanCollect();
    } else {
      if (selectedCardIds.size !== 1) {
        alert("Seleziona esattamente 1 carta dalla tua mano da scartare, poi clicca sul monte degli scarti.");
        return;
      }
      const selectedCardId = Array.from(selectedCardIds)[0];
      const card = gameState.hands[0].find(c => c.id === selectedCardId)!;
      handleDiscard(card);
    }
  };

  // Ordinamento mano
  const sortHand = (type: 'value' | 'suit') => {
    setGameState(prev => {
      const hand = [...prev.hands[0]];
      
      const rankOrder: { [key: string]: number } = {
        '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12, '2': 13, 'Joker': 14
      };
      const suitOrder: { [key: string]: number } = { '♥': 1, '♦': 2, '♣': 3, '♠': 4 };

      if (type === 'value') {
        hand.sort((a, b) => (rankOrder[a.rank] || 0) - (rankOrder[b.rank] || 0) || (suitOrder[a.suit || ''] || 0) - (suitOrder[b.suit || ''] || 0));
      } else {
        hand.sort((a, b) => (suitOrder[a.suit || ''] || 0) - (suitOrder[b.suit || ''] || 0) || (rankOrder[a.rank] || 0) - (rankOrder[b.rank] || 0));
      }
      
      const nextHands = [...prev.hands];
      nextHands[0] = hand;
      return {
        ...prev,
        hands: nextHands
      };
    });
    setSelectedCardIds(new Set());
  };

  // Sposta una carta all'interno della mano
  const moveCardInHand = (srcIdx: number, destIdx: number) => {
    if (srcIdx === destIdx) return;
    setGameState(prev => {
      const nextHand = [...prev.hands[0]];
      if (srcIdx < 0 || srcIdx >= nextHand.length || destIdx < 0 || destIdx >= nextHand.length) return prev;
      
      const [card] = nextHand.splice(srcIdx, 1);
      nextHand.splice(destIdx, 0, card);
      
      const nextHands = [...prev.hands];
      nextHands[0] = nextHand;
      return {
        ...prev,
        hands: nextHands
      };
    });
  };

  // Sposta la singola carta selezionata a sinistra (-1) o a destra (+1)
  const moveSelectedCard = (direction: -1 | 1) => {
    if (selectedCardIds.size !== 1) return;
    const cardId = Array.from(selectedCardIds)[0];
    const hand = gameState.hands[0];
    const currIdx = hand.findIndex(c => c.id === cardId);
    if (currIdx === -1) return;
    const newIdx = currIdx + direction;
    if (newIdx >= 0 && newIdx < hand.length) {
      moveCardInHand(currIdx, newIdx);
    }
  };

  // Touch drag and drop reordering per dispositivi mobile
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    srcIdx: number;
    hasMoved: boolean;
  } | null>(null);

  const handleTouchStartCard = (e: React.TouchEvent, idx: number) => {
    if (gameMode !== 'game') return;
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      srcIdx: idx,
      hasMoved: false,
    };
  };

  const handleTouchMoveCard = (e: React.TouchEvent, spacing: number) => {
    if (!touchStateRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStateRef.current.startX;
    const deltaY = touch.clientY - touchStateRef.current.startY;

    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10 || touchStateRef.current.hasMoved) {
      touchStateRef.current.hasMoved = true;
      const hand = gameState.hands[0];
      const offsetIndices = Math.round(deltaX / spacing);
      const targetIdx = Math.max(0, Math.min(hand.length - 1, touchStateRef.current.srcIdx + offsetIndices));
      
      setDraggedIdx(touchStateRef.current.srcIdx);
      setDragOverIdx(targetIdx);
    }
  };

  const handleTouchEndCard = (e: React.TouchEvent, cardId: string) => {
    e.preventDefault();
    if (!touchStateRef.current) return;
    const { hasMoved } = touchStateRef.current;
    touchStateRef.current = null;

    if (hasMoved && draggedIdx !== null && dragOverIdx !== null && draggedIdx !== dragOverIdx) {
      moveCardInHand(draggedIdx, dragOverIdx);
    } else if (!hasMoved) {
      toggleCardSelect(cardId);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Reorder mano tramite drag and drop in tempo reale (Desktop)
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData("text/plain", idx.toString());
    
    const target = e.currentTarget as HTMLDivElement;
    
    // Crea un clone pulito e isolato della faccia della carta per l'anteprima di trascinamento
    if (target.firstElementChild) {
      const clone = target.firstElementChild.cloneNode(true) as HTMLDivElement;
      
      // Imposta stili isolati per evitare deformazioni, rotazioni o trasparenze dovute a vicini
      clone.style.position = 'fixed';
      clone.style.top = '-1000px';
      clone.style.left = '-1000px';
      clone.style.transform = 'none';
      clone.style.transition = 'none';
      clone.style.opacity = '1';
      clone.style.margin = '0';
      clone.style.zIndex = '-9999';
      clone.style.pointerEvents = 'none';
      
      document.body.appendChild(clone);
      
      // Imposta il clone come immagine di trascinamento centrata (carta 56x80px)
      e.dataTransfer.setDragImage(clone, 28, 40);
      
      // Rimuovi il clone dal DOM nel prossimo ciclo dell'event loop, dopo che il browser lo ha fotografato
      setTimeout(() => {
        clone.remove();
      }, 0);
    }
    
    // Aggiorna lo stato asincronamente per rendere trasparente il placeholder in mano
    setTimeout(() => {
      setDraggedIdx(idx);
    }, 0);
  };

  const handleDragOverCard = (e: React.DragEvent, destIdx: number) => {
    e.preventDefault();
    if (dragOverIdx !== destIdx) {
      setDragOverIdx(destIdx);
    }
  };

  const handleDrop = (e: React.DragEvent, destIdx: number) => {
    const srcStr = e.dataTransfer.getData("text/plain");
    setDraggedIdx(null);
    setDragOverIdx(null);
    if (!srcStr) return;
    const srcIdx = Number(srcStr);
    if (isNaN(srcIdx) || srcIdx === destIdx) return;
    
    moveCardInHand(srcIdx, destIdx);
    setSelectedCardIds(new Set());
  };

  // Avvio round successivo
  const startNextRound = (scores: number[]) => {
    const nextPoints = [
      gameState.teams[0].points + scores[0],
      gameState.teams[1].points + scores[1]
    ];
    
    if (nextPoints[0] >= 2000 || nextPoints[1] >= 2000) {
      const winner = nextPoints[0] > nextPoints[1] ? "Squadra 1 (Noi)" : "Squadra 2 (Avversari)";
      alert(`PARTITA TERMINATA!\nVince la ${winner} con ${Math.max(...nextPoints)} punti!`);
      setGameMode('menu');
    } else {
      setGameState(createInitialState(gameState.roundNumber + 1, nextPoints));
      setSelectedCardIds(new Set());
      setLastUpdatedMeld(null);
      setIsTransitioning(false);
      setShowScoreModal(false);
    }
  };

  // Menù Principale
  if (gameMode === 'menu') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#090b0d] text-white overflow-hidden select-none">
        <div className="text-center max-w-md p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative">
          {/* Cerchio dorato satinato di sfondo */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center shadow-xl">
            <span className="text-amber-500 text-3xl font-bold">♢</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-wide text-amber-500 mt-8 mb-2">BURRACO PRO</h1>
          <p className="text-sm text-slate-400 font-medium mb-8">Casino WebGL 3D Edition</p>
          
          <div className="flex flex-col gap-4">
            <button
              onClick={() => startNewGame()}
              className="flex items-center justify-center gap-3 w-full py-4.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] text-white font-extrabold text-lg rounded-2xl transition-all shadow-xl shadow-emerald-950/20 uppercase tracking-widest"
            >
              <Play size={20} fill="white" />
              Nuova Partita
            </button>
          </div>

          <p className="text-[10px] text-slate-500 italic mt-8 leading-snug">
            Realizzato con React, TypeScript e Tailwind CSS per transizioni fluide e ombreggiature tridimensionali reali.
          </p>
        </div>
      </div>
    );
  }

  // Elementi punteggio
  const scoreResults = calculateRoundScores(gameState);

  return (
    <div className="flex h-[100dvh] w-screen bg-[#090b0d] text-white overflow-hidden select-none font-sans relative">
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.25s ease-out forwards;
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out forwards;
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>

      {/* =====================================================================
          LAYOUT ORIZZONTALE (Landscape Mobile & Desktop) — 3 colonne
      ====================================================================== */}
      {!isPortrait ? (
        <div className="flex w-full h-full">
          {/* Colonna Sinistra */}
          <MeldColumn
            title={isMobile ? "S1 (Noi)" : "SQUADRA 1 (Noi)"}
            teamId={0}
            melds={gameState.teams[0].melds}
            titleColorClass="text-emerald-400"
            onMeldClick={handleAddToMeld}
            buttonText={gameState.currentPlayerIdx === 0 && gameMode === 'game' ? "[+] NUOVA CALATA" : undefined}
            onButtonClick={handleNewMeld}
            isButtonDisabled={gameState.turnPhase !== 'play'}
            lastUpdatedMeld={lastUpdatedMeld}
            points={gameState.teams[0].points}
            cardSize={isMobile ? 'mini' : 'normal'}
          />

          {/* Tavolo Verde Centrale */}
          <div
            className="flex-1 h-full relative select-none shadow-[inset_0_0_120px_rgba(0,0,0,0.9)] overflow-hidden"
            style={{ background: 'radial-gradient(circle, #0f5135 0%, #08291a 65%, #03120c 100%)' }}
          >
            <div className="absolute inset-2 sm:inset-4 border-[8px] sm:border-[14px] border-[#29170e] rounded-[32px] sm:rounded-[48px] pointer-events-none shadow-[inset_0_4px_12px_rgba(0,0,0,0.95),_0_15px_30px_rgba(0,0,0,0.85)] z-0" />
            <div className="absolute inset-[12px] sm:inset-[24px] border-[0.8px] border-[#d4af37]/35 rounded-[26px] sm:rounded-[38px] pointer-events-none z-0" />

            {/* Pozzetti */}
            <div className="absolute top-2 left-2 sm:top-6 sm:left-6 lg:top-10 lg:left-10 z-20 flex items-center min-w-[50px] sm:min-w-[70px] min-h-[70px] sm:min-h-[90px]">
              {gameState.pozzetti.length === 0 ? (
                <div className="w-10 h-14 sm:w-14 sm:h-20 rounded-md border border-dashed border-[#d4af37]/10 flex items-center justify-center text-[6px] sm:text-[7px] text-[#d4af37]/25 font-black tracking-widest text-center px-1">
                  POZZETTI PRESI
                </div>
              ) : (
                gameState.pozzetti.map((_, pIdx) => (
                  <div key={pIdx} className="absolute shadow-[3px_3px_6px_rgba(0,0,0,0.55)] transition-all duration-300"
                    style={{ left: `${pIdx * 10}px`, zIndex: 10 + pIdx, transform: pIdx === 0 ? 'rotate(-6deg)' : 'rotate(6deg)' }}>
                    <CardView card={null} size={isMobile ? 'mini' : 'normal'} />
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[6px] sm:text-[7px] font-black text-[#d4af37]/90 whitespace-nowrap bg-slate-950/80 px-1 py-0.5 rounded border border-[#d4af37]/15">
                      POZZ. {pIdx + 1}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Badge Round + Esci */}
            <div className="absolute top-2 right-2 sm:top-6 sm:right-6 lg:top-10 lg:right-10 z-20 flex items-center gap-1.5 sm:gap-3">
              <div className="bg-slate-950/85 backdrop-blur-md border border-[#d4af37]/30 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl shadow-md text-[8px] sm:text-[10px] font-black text-amber-400 tracking-wider">
                R.{gameState.roundNumber}
              </div>
              <button onClick={() => setGameMode('menu')}
                className="px-2 sm:px-3 py-1 sm:py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/35 text-rose-200 font-extrabold text-[8px] sm:text-[10px] uppercase tracking-wider rounded-lg sm:rounded-xl transition-all active:scale-95 shadow-md">
                ESCI
              </button>
            </div>

            {/* Bot 3 top */}
            <div className="absolute top-1 sm:top-4 lg:top-8 left-1/2 -translate-x-1/2 z-10 scale-90 sm:scale-100">
              <PlayerWidget name="Bot 3" role="Compagno (S1)" cardCount={gameState.hands[2].length} isActive={gameState.currentPlayerIdx === 2} />
            </div>

            {/* Bot 2 sx */}
            <div className="absolute left-1 sm:left-4 lg:left-8 top-[38%] -translate-y-1/2 z-10 scale-85 sm:scale-100">
              <PlayerWidget name="Bot 2" role="Avversario (S2)" cardCount={gameState.hands[1].length} isActive={gameState.currentPlayerIdx === 1} />
            </div>

            {/* Status pill */}
            <div key={gameState.history.length}
              className="absolute left-1/2 top-[22%] sm:top-[24%] -translate-x-1/2 -translate-y-1/2 z-20 px-3 sm:px-6 py-1 sm:py-2.5 bg-slate-950/85 backdrop-blur-md border border-[#d4af37]/30 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.6)] max-w-[200px] sm:max-w-sm text-center animate-card-pop truncate">
              <span className="text-[#d4af37] font-extrabold text-[8px] sm:text-xs tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                {gameState.history[gameState.history.length - 1]}
              </span>
            </div>

            {/* Mazzo e Scarti */}
            <div className="absolute left-1/2 top-[40%] sm:top-[44%] -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
              <div className="flex items-center gap-6 sm:gap-10">
                <div className="relative group">
                  {gameState.deck.length > 3 && (
                    <>
                      <div className="absolute top-[1px] left-[1px] w-9 h-13 sm:w-14 sm:h-20 bg-[#0c1a30] rounded border border-[#d4af37]/10" />
                      <div className="absolute top-[2px] left-[2px] w-9 h-13 sm:w-14 sm:h-20 bg-[#0c1a30] rounded border border-[#d4af37]/15" />
                    </>
                  )}
                  <div className="relative shadow-[1px_1px_0_#d4af37,_2px_2px_0_#d4af37,_3px_3px_8px_rgba(0,0,0,0.75)] rounded">
                    <CardView card={null} onClick={handleHumanDraw} size={isMobile ? 'mini' : 'normal'} />
                  </div>
                  <div className="absolute -bottom-4 sm:-bottom-6 left-1/2 -translate-x-1/2 text-[7px] sm:text-[9px] font-black text-slate-400 tracking-wider whitespace-nowrap">
                    {gameState.deck.length} CARTE
                  </div>
                </div>

                <div className="relative flex items-center min-w-[60px] sm:min-w-[85px] min-h-[60px] sm:min-h-[90px] group cursor-pointer"
                  onClick={handleScartiClick}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const srcIdx = Number(e.dataTransfer.getData("text/plain"));
                    if (gameState.currentPlayerIdx === 0 && gameState.turnPhase === 'play') {
                      const card = gameState.hands[0][srcIdx];
                      handleDiscard(card);
                    }
                  }}>
                  {gameState.discardPile.length === 0 ? (
                    <div className="w-9 h-13 sm:w-14 sm:h-20 rounded border border-dashed border-[#d4af37]/20 flex items-center justify-center text-[7px] sm:text-[8px] text-[#d4af37]/40 font-black tracking-widest">
                      SCARTI
                    </div>
                  ) : (
                    gameState.discardPile.slice(-6).map((card, idx, arr) => {
                      const angle = (idx - (arr.length - 1) / 2) * 6;
                      return (
                        <div key={card.id} className="absolute transition-transform duration-200 hover:scale-105 hover:z-50"
                          style={{ left: `${idx * (isMobile ? 10 : 14)}px`, zIndex: idx, transform: `rotate(${angle}deg)` }}>
                          <CardView card={card} size={isMobile ? 'mini' : 'normal'} />
                        </div>
                      );
                    })
                  )}
                  {gameState.discardPile.length > 0 && (
                    <div className="absolute -bottom-4 sm:-bottom-5 left-1/2 -translate-x-1/2 text-[7px] sm:text-[9px] font-black text-slate-400 tracking-wider whitespace-nowrap">
                      PILA ({gameState.discardPile.length})
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bot 4 dx */}
            <div className="absolute right-1 sm:right-4 lg:right-8 top-[38%] -translate-y-1/2 z-10 scale-85 sm:scale-100">
              <PlayerWidget name="Bot 4" role="Avversario (S2)" cardCount={gameState.hands[3].length} isActive={gameState.currentPlayerIdx === 3} />
            </div>

            {/* Giocatore umano */}
            <div className="absolute bottom-1 sm:bottom-4 lg:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 sm:gap-2 z-10">
              <div className="flex items-center gap-2 sm:gap-6">
                <button onClick={() => sortHand('value')}
                  className="px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-500 font-bold text-[7px] sm:text-[9px] uppercase tracking-wider rounded-md transition-all active:scale-95 shadow">
                  Ordina Val.
                </button>
                <span className={`text-[8px] sm:text-[10px] uppercase whitespace-nowrap transition-all duration-300 px-2 sm:px-4 py-0.5 sm:py-1.5 rounded-full
                  ${gameState.currentPlayerIdx === 0 && gameMode === 'game'
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-black tracking-[0.15em] sm:tracking-[0.2em] scale-105 shadow-[0_0_15px_rgba(245,158,11,0.35)] animate-pulse'
                    : 'text-slate-400 font-bold tracking-widest border border-transparent'
                  }`}>
                  {gameState.currentPlayerIdx === 0 && gameMode === 'game' ? '★ IL TUO TURNO ★' : 'La tua mano'}
                </span>
                <button onClick={() => sortHand('suit')}
                  className="px-2 sm:px-3 py-0.5 sm:py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-500 font-bold text-[7px] sm:text-[9px] uppercase tracking-wider rounded-md transition-all active:scale-95 shadow">
                  Ordina Seme
                </button>
              </div>
              {(() => {
                const hand = gameState.hands[0];
                const N = hand.length;
                const maxFanWidth = isMobile ? 280 : 380;
                const spacing = N <= 1 ? 52 : Math.min(44, maxFanWidth / (N - 1));
                const handWidth = N === 0 ? 0 : (N - 1) * spacing + 56;
                return (
                  <div data-testid="hand-fan" className="relative h-20 sm:h-24 overflow-visible transition-all duration-300" style={{ width: `${handWidth}px` }}>
                    {hand.map((card, idx) => {
                      const isSelected = selectedCardIds.has(card.id);
                      const isDraggingThis = draggedIdx === idx;
                      const isHoveredTarget = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
                      return (
                        <div key={card.id} draggable={gameMode === 'game'}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOverCard(e, idx)}
                          onDragLeave={() => { if (dragOverIdx === idx) setDragOverIdx(null); }}
                          onDrop={(e) => handleDrop(e, idx)}
                          onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                          onTouchStart={(e) => handleTouchStartCard(e, idx)}
                          onTouchMove={(e) => handleTouchMoveCard(e, spacing)}
                          onTouchEnd={(e) => handleTouchEndCard(e, card.id)}
                          data-testid="hand-card" data-card-id={card.id}
                          className={`absolute w-14 h-20 transition-all duration-300 ease-out cursor-grab active:cursor-grabbing select-none
                            ${isDraggingThis ? 'opacity-20 scale-95 z-0' : 'opacity-100'}
                            ${isHoveredTarget ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-md scale-105 z-40 shadow-2xl' : ''}
                            ${draggedIdx === null && !isDraggingThis ? 'hover:!-translate-y-4 hover:!z-50 hover:shadow-xl' : ''}`}
                          style={{
                            left: `${idx * spacing}px`,
                            transform: isSelected ? 'translateY(-20px)' : undefined,
                            zIndex: isHoveredTarget ? 30 : idx + 10,
                          }}
                          onClick={() => toggleCardSelect(card.id)}
                        >
                          <CardView card={card} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Colonna Destra */}
          <MeldColumn
            title={isMobile ? "S2 (Avv.)" : "SQUADRA 2"}
            teamId={1}
            melds={gameState.teams[1].melds}
            titleColorClass="text-red-400"
            lastUpdatedMeld={lastUpdatedMeld}
            points={gameState.teams[1].points}
            cardSize={isMobile ? 'mini' : 'normal'}
          />
        </div>
      ) : (
        /* =====================================================================
            LAYOUT VERTICALE (Portrait Mobile) — Cascata e sezioni verticali
        ====================================================================== */
        <div className="flex flex-col w-full h-full bg-[#071a0f]">

        {/* ── TOP BAR: info round + avatar bot ─────────────────────────── */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-950/90 border-b border-slate-900 shrink-0 gap-1.5">
          {/* Pozzetti (compact) */}
          <div className="flex items-center gap-0.5 shrink-0">
            {gameState.pozzetti.length === 0 ? (
              <span className="text-[6px] text-slate-600 font-bold uppercase tracking-wider px-0.5">📦</span>
            ) : (
              gameState.pozzetti.map((_, pIdx) => (
                <div key={pIdx} className="relative w-5 h-7">
                  <CardView card={null} size="micro" />
                </div>
              ))
            )}
          </div>

          {/* Bot2 — AVVERSARIO sx */}
          <div className={`flex flex-col items-center px-1.5 py-0.5 rounded-lg border text-[8px] font-bold shrink-0 min-w-[36px]
            ${gameState.currentPlayerIdx === 1
              ? 'border-amber-400 bg-amber-500/15 text-amber-300'
              : 'border-red-900/60 bg-red-950/40 text-red-400'}`}>
            <span className="text-[6px] leading-none">⚔️ avv.</span>
            <span className="font-black text-[9px] leading-none mt-0.5">{gameState.hands[1].length}</span>
          </div>

          {/* Bot3 — ALLEATO (compagno) */}
          <div className={`flex flex-col items-center px-1.5 py-0.5 rounded-lg border text-[8px] font-bold shrink-0 min-w-[36px]
            ${gameState.currentPlayerIdx === 2
              ? 'border-amber-400 bg-amber-500/15 text-amber-300'
              : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-400'}`}>
            <span className="text-[6px] leading-none">🤝 ally</span>
            <span className="font-black text-[9px] leading-none mt-0.5">{gameState.hands[2].length}</span>
          </div>

          {/* Badge Round */}
          <span className="text-[9px] font-black text-amber-400 bg-slate-900 border border-[#d4af37]/30 px-1.5 py-1 rounded-lg shrink-0">
            R.{gameState.roundNumber}
          </span>

          {/* Bot4 — AVVERSARIO dx */}
          <div className={`flex flex-col items-center px-1.5 py-0.5 rounded-lg border text-[8px] font-bold shrink-0 min-w-[36px]
            ${gameState.currentPlayerIdx === 3
              ? 'border-amber-400 bg-amber-500/15 text-amber-300'
              : 'border-red-900/60 bg-red-950/40 text-red-400'}`}>
            <span className="text-[6px] leading-none">⚔️ avv.</span>
            <span className="font-black text-[9px] leading-none mt-0.5">{gameState.hands[3].length}</span>
          </div>

          {/* ESCI */}
          <button onClick={() => setGameMode('menu')}
            className="px-2 py-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/35 text-rose-300 font-extrabold text-[9px] uppercase rounded-lg transition-all active:scale-95 shrink-0">
            ✕
          </button>
        </div>

        {/* ── ZONA AVVERSARI: calate Squadra 2 (Ampio spazio a colonna) ────── */}
        <div className="flex-1 min-h-[90px] max-h-[40%] bg-[#040f08]/90 border-b border-slate-900/60 flex flex-col overflow-hidden">
          <MeldRow
            teamId={1}
            melds={gameState.teams[1].melds}
            titleColorClass="text-red-400"
            teamLabel="⚔️ Avversari"
            points={gameState.teams[1].points}
            lastUpdatedMeld={lastUpdatedMeld}
          />
        </div>

        {/* ── ZONA CENTRALE: Mazzo + Scarti + Status (Grandezza Standard) ─── */}
        <div className="shrink-0 flex items-center justify-center gap-8 py-2 px-4 bg-[#071a0f] relative border-b border-slate-900/40">
          {/* Status pill */}
          <div key={gameState.history.length}
            className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-0.5 bg-slate-950/90 border border-[#d4af37]/25 rounded-full text-[8.5px] font-bold text-[#d4af37] whitespace-nowrap max-w-[65vw] truncate animate-card-pop shadow-md">
            {gameState.history[gameState.history.length - 1]}
          </div>

          {/* Mazzo */}
          <div className="relative group mt-2 flex flex-col items-center">
            {gameState.deck.length > 3 && (
              <>
                <div className="absolute top-[1.5px] left-[1.5px] w-14 h-20 bg-[#0c1a30] rounded-md border border-[#d4af37]/10" />
                <div className="absolute top-[3px] left-[3px] w-14 h-20 bg-[#0c1a30] rounded-md border border-[#d4af37]/15" />
              </>
            )}
            <div className="relative shadow-[1px_1px_0_#d4af37,_2px_2px_0_#d4af37,_3px_3px_8px_rgba(0,0,0,0.75)] rounded-md">
              <CardView card={null} onClick={handleHumanDraw} size="normal" />
            </div>
            <div className="text-center text-[8px] font-black text-slate-400 mt-1 whitespace-nowrap">{gameState.deck.length} carte</div>
          </div>

          {/* Scarti */}
          <div className="relative flex items-center cursor-pointer mt-2" style={{ minWidth: '60px', minHeight: '82px' }}
            onClick={handleScartiClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const srcIdx = Number(e.dataTransfer.getData("text/plain"));
              if (gameState.currentPlayerIdx === 0 && gameState.turnPhase === 'play') {
                handleDiscard(gameState.hands[0][srcIdx]);
              }
            }}>
            {gameState.discardPile.length === 0 ? (
              <div className="w-14 h-20 rounded-md border border-dashed border-[#d4af37]/20 flex items-center justify-center text-[7.5px] text-[#d4af37]/40 font-black tracking-widest">
                SCARTI
              </div>
            ) : (
              gameState.discardPile.slice(-6).map((card, idx, arr) => {
                const angle = (idx - (arr.length - 1) / 2) * 5;
                return (
                  <div key={card.id} className="absolute transition-transform duration-200"
                    style={{ left: `${idx * 12}px`, zIndex: idx, transform: `rotate(${angle}deg)` }}>
                    <CardView card={card} size="normal" />
                  </div>
                );
              })
            )}
            <div className="text-center text-[8px] font-black text-slate-400 absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
              {gameState.discardPile.length > 0 ? `Pila (${gameState.discardPile.length})` : ''}
            </div>
          </div>
        </div>

        {/* ── ZONA NOI: calate Squadra 1 + pulsante calata (Ampio spazio a colonna) */}
        <div className="flex-1 min-h-[110px] max-h-[45%] bg-[#040f08]/90 border-b border-slate-900/60 flex flex-col overflow-hidden">
          <MeldRow
            teamId={0}
            melds={gameState.teams[0].melds}
            titleColorClass="text-emerald-400"
            teamLabel="👥 Noi"
            points={gameState.teams[0].points}
            onMeldClick={handleAddToMeld}
            lastUpdatedMeld={lastUpdatedMeld}
            actionButton={
              gameState.currentPlayerIdx === 0 && gameMode === 'game' ? (
                <button
                  onClick={() => {
                    if (gameState.turnPhase !== 'play') {
                      alert("Devi prima PESCARE una carta dal mazzo o dagli scarti!");
                      return;
                    }
                    if (selectedCardIds.size === 0) {
                      alert("Seleziona prima dalla tua mano le carte da calare (tocca 3 o più carte)!");
                      return;
                    }
                    handleNewMeld();
                  }}
                  className={`px-3 py-1 font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-md active:scale-95 border ${
                    gameState.turnPhase === 'play' && selectedCardIds.size >= 3
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-300 animate-pulse'
                      : gameState.turnPhase === 'play'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900'
                      : 'bg-slate-900/80 text-slate-500 border-slate-800'
                  }`}
                >
                  [+] NUOVA CALATA
                </button>
              ) : undefined
            }
          />
        </div>

        {/* ── MANO GIOCATORE (Compatta in fondo) ─────────────────────────── */}
        <div className="shrink-0 flex flex-col justify-end pb-2 bg-[#071a0f]" style={{ overflow: 'visible' }}>
          {/* Header mano con bottoni ordinamento e barra azioni dinamica */}
          <div className="flex items-center justify-between px-2 py-1 shrink-0 gap-1">
            <button onClick={() => sortHand('value')}
              className="px-2 py-1 bg-slate-900 border border-amber-500/25 text-amber-500 font-bold text-[8px] uppercase tracking-wide rounded-md transition-all active:scale-95">
              Valore
            </button>

            {/* Azione contestuale centrale basata sullo stato del turno */}
            {gameState.currentPlayerIdx === 0 && gameMode === 'game' ? (
              gameState.turnPhase === 'draw' ? (
                <span className="text-[8.5px] uppercase whitespace-nowrap px-3 py-1 rounded-full font-black bg-amber-500/15 border border-amber-500/40 text-amber-300 tracking-wider animate-pulse">
                  👉 Pesca dal mazzo o scarti
                </span>
              ) : selectedCardIds.size >= 3 ? (
                <button
                  onClick={handleNewMeld}
                  className="px-3.5 py-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 border border-emerald-300 text-white font-black text-[9px] uppercase tracking-wider rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse active:scale-95"
                >
                  ✨ CALA ({selectedCardIds.size} CARTE)
                </button>
              ) : selectedCardIds.size === 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveSelectedCard(-1)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/30 text-amber-300 font-bold text-[8px] uppercase tracking-wider rounded-md active:scale-95 shadow"
                    title="Sposta a sinistra"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => {
                      const selectedCardId = Array.from(selectedCardIds)[0];
                      const card = gameState.hands[0].find(c => c.id === selectedCardId);
                      if (card) handleDiscard(card);
                    }}
                    className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-amber-600 border border-rose-400 text-white font-black text-[8px] uppercase tracking-wider rounded-full shadow-md active:scale-95"
                  >
                    🗑️ SCARTA
                  </button>
                  <button
                    onClick={() => moveSelectedCard(1)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-amber-500/30 text-amber-300 font-bold text-[8px] uppercase tracking-wider rounded-md active:scale-95 shadow"
                    title="Sposta a destra"
                  >
                    ▶
                  </button>
                </div>
              ) : (
                <span className="text-[9px] uppercase whitespace-nowrap px-3 py-1 rounded-full font-black bg-amber-500/15 border border-amber-500/40 text-amber-300 tracking-[0.15em] shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse">
                  ★ IL TUO TURNO ★
                </span>
              )
            ) : (
              <span className="text-[8.5px] uppercase whitespace-nowrap px-3 py-1 rounded-full font-bold text-slate-500 border border-transparent tracking-wider">
                La tua mano
              </span>
            )}

            <button onClick={() => sortHand('suit')}
              className="px-2 py-1 bg-slate-900 border border-amber-500/25 text-amber-500 font-bold text-[8px] uppercase tracking-wide rounded-md transition-all active:scale-95">
              Seme
            </button>
          </div>

          {/* Carte in mano */}
          {(() => {
            const hand = gameState.hands[0];
            const N = hand.length;
            const maxFanWidth = isPortrait ? Math.min(window.innerWidth - 24, 320) : Math.min(window.innerWidth - 24, 400);
            const spacing = N <= 1 ? 48 : Math.min(44, maxFanWidth / (N - 1));
            const handWidth = N === 0 ? 0 : (N - 1) * spacing + 56;
            return (
              <div className="w-full" style={{ overflowX: 'clip', overflowY: 'visible', paddingTop: '24px' }}>
                <div data-testid="hand-fan" className="relative h-24 mx-auto" style={{ width: `${handWidth}px`, overflow: 'visible' }}>
                  {hand.map((card, idx) => {
                    const isSelected = selectedCardIds.has(card.id);
                    const isDraggingThis = draggedIdx === idx;
                    const isHoveredTarget = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
                    return (
                      <div
                        key={card.id}
                        data-testid="hand-card"
                        data-card-id={card.id}
                        className={`absolute w-14 h-20 transition-all duration-200 ease-out cursor-pointer select-none
                          ${isDraggingThis ? 'opacity-30 scale-95 z-0' : 'opacity-100'}
                          ${isHoveredTarget ? 'ring-2 ring-amber-400 rounded-md scale-105 z-40 shadow-2xl' : ''}
                          ${isSelected ? 'ring-2 ring-amber-400 rounded-md' : ''}`}
                        style={{
                          left: `${idx * spacing}px`,
                          transform: isSelected ? 'translateY(-20px)' : undefined,
                          zIndex: isHoveredTarget ? 30 : idx + 10,
                        }}
                        onClick={() => toggleCardSelect(card.id)}
                        onTouchStart={(e) => handleTouchStartCard(e, idx)}
                        onTouchMove={(e) => handleTouchMoveCard(e, spacing)}
                        onTouchEnd={(e) => handleTouchEndCard(e, card.id)}
                      >
                        <CardView card={card} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* MODAL BREAKDOWN PUNTEGGI DI FINE ROUND */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 animate-fade-in select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full text-center shadow-2xl relative m-4">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="text-amber-500" size={28} />
            </div>

            <h3 className="text-2xl font-extrabold tracking-wide text-amber-500 mb-1">FINE ROUND {gameState.roundNumber}</h3>
            <p className="text-xs text-slate-400 font-medium mb-6">Dettaglio calcolo punteggi del round</p>

            <div className="grid grid-cols-3 gap-y-3 text-xs text-left mb-8 border-b border-t border-slate-800 py-4 px-2">
              <div className="font-bold text-slate-400">Dettaglio Punti</div>
              <div className="font-bold text-center text-emerald-400">S1 (Noi)</div>
              <div className="font-bold text-center text-red-400">S2 (Avversari)</div>

              <div className="text-slate-300">Valore carte calate:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0].meldedCardsValue}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1].meldedCardsValue}</div>

              <div className="text-slate-300">Bonus Burrachi:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0].burracoBonus}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1].burracoBonus}</div>

              <div className="text-slate-300">Bonus Chiusura:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0].closingBonus}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1].closingBonus}</div>

              <div className="text-slate-300 font-medium">Penale Pozzetto:</div>
              <div className="text-center font-bold text-emerald-500">{scoreResults.details[0].pozzettoPenalty}</div>
              <div className="text-center font-bold text-red-500">{scoreResults.details[1].pozzettoPenalty}</div>

              <div className="text-slate-300 font-medium">Carte in mano:</div>
              <div className="text-center font-bold text-emerald-500">{scoreResults.details[0].handPenalty}</div>
              <div className="text-center font-bold text-red-500">{scoreResults.details[1].handPenalty}</div>

              <div className="font-extrabold text-slate-200 mt-2 border-t border-slate-800/80 pt-2">Totale Round:</div>
              <div className="text-center font-extrabold text-emerald-400 mt-2 border-t border-slate-800/80 pt-2">
                {scoreResults.details[0].total >= 0 ? '+' : ''}{scoreResults.details[0].total}
              </div>
              <div className="text-center font-extrabold text-red-400 mt-2 border-t border-slate-800/80 pt-2">
                {scoreResults.details[1].total >= 0 ? '+' : ''}{scoreResults.details[1].total}
              </div>

              <div className="font-extrabold text-amber-500 mt-1">Punteggio Totale:</div>
              <div className="text-center font-black text-emerald-400 mt-1">
                {gameState.teams[0].points + scoreResults.scores[0]} pt
              </div>
              <div className="text-center font-black text-red-400 mt-1">
                {gameState.teams[1].points + scoreResults.scores[1]} pt
              </div>
            </div>

            <button onClick={() => startNextRound(scoreResults.scores)}
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-black font-extrabold text-xs tracking-wider rounded-xl transition-all shadow-md active:scale-95">
              <CheckCircle size={15} />
              Prosegui Partita
            </button>
          </div>
        </div>
      )}
    </div>
  );

}
