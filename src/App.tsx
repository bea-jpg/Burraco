import React, { useState, useEffect, useRef } from 'react';
import { type GameState, createInitialState, getPlayerTeamId, drawFromDeck, takeDiscardPile, meldNewCombination, addToExistingMeld, discardCard, calculateRoundScores } from './utils/gameEngine';
import { chooseDrawAction, playSingleBotMeld, chooseBotDiscard } from './utils/botPlayer';
import { CardView } from './components/CardView';
import { MeldColumn } from './components/MeldColumn';
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
  
  const isBotRunningRef = useRef<boolean>(false);

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

  // Reorder mano tramite drag and drop in tempo reale
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
    
    setGameState(prev => {
      const nextHand = [...prev.hands[0]];
      if (srcIdx < 0 || srcIdx >= nextHand.length || destIdx < 0 || destIdx >= nextHand.length) return prev;
      
      // Sposta la carta nell'array una sola volta al rilascio
      const [card] = nextHand.splice(srcIdx, 1);
      nextHand.splice(destIdx, 0, card);
      
      const nextHands = [...prev.hands];
      nextHands[0] = nextHand;
      return {
        ...prev,
        hands: nextHands
      };
    });
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
    <div className="flex h-screen w-screen bg-[#090b0d] text-white overflow-hidden select-none font-sans">
      {/* 1. Colonna Sinistra (Meld Squadra 1) */}
      <MeldColumn
        title="SQUADRA 1 (Noi)"
        teamId={0}
        melds={gameState.teams[0].melds}
        titleColorClass="text-emerald-400"
        onMeldClick={handleAddToMeld}
        buttonText={gameState.currentPlayerIdx === 0 && gameMode === 'game' ? "[+] NUOVA CALATA" : undefined}
        onButtonClick={handleNewMeld}
        isButtonDisabled={gameState.turnPhase !== 'play'}
        lastUpdatedMeld={lastUpdatedMeld}
        points={gameState.teams[0].points}
      />

      {/* 2. Colonna Centrale (Tavolo Verde Casinò Realistico con Layout Assoluto) */}
      <div 
        className="flex-1 h-full relative select-none shadow-[inset_0_0_120px_rgba(0,0,0,0.9)] overflow-hidden"
        style={{
          background: 'radial-gradient(circle, #0f5135 0%, #08291a 65%, #03120c 100%)'
        }}
      >
        {/* Cornice in Mogano Lucido 3D con inserti dorati */}
        <div className="absolute inset-4 border-[14px] border-[#29170e] rounded-[48px] pointer-events-none shadow-[inset_0_4px_12px_rgba(0,0,0,0.95),_0_15px_30px_rgba(0,0,0,0.85)] z-0" />
        <div className="absolute inset-[24px] border-[0.8px] border-[#d4af37]/35 rounded-[38px] pointer-events-none z-0" />
        <div className="absolute inset-[27px] border-[0.3px] border-[#d4af37]/15 rounded-[35px] pointer-events-none z-0" />

        {/* Pozzetti in alto a sinistra sul feltro (fuori dal flusso orizzontale per evitare tagli dei bot) */}
        <div className="absolute top-10 left-10 z-20 flex items-center min-w-[70px] min-h-[90px]">
          {gameState.pozzetti.length === 0 ? (
            <div className="w-14 h-20 rounded-md border border-dashed border-[#d4af37]/10 flex items-center justify-center text-[7px] text-[#d4af37]/25 font-black tracking-widest text-center px-1">
              POZZETTI PRESI
            </div>
          ) : (
            gameState.pozzetti.map((_, pIdx) => (
              <div
                key={pIdx}
                className="absolute shadow-[3px_3px_6px_rgba(0,0,0,0.55)] transition-all duration-300"
                style={{
                  left: `${pIdx * 14}px`,
                  zIndex: 10 + pIdx,
                  transform: pIdx === 0 ? 'rotate(-6deg)' : 'rotate(6deg)'
                }}
              >
                <CardView card={null} size="normal" />
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[7px] font-black text-[#d4af37]/90 whitespace-nowrap bg-slate-950/80 px-1 py-0.5 rounded border border-[#d4af37]/15">
                  POZZETTO {pIdx + 1}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Badge e pulsante ESCI in alto a destra (estremamente compatto per evitare sovrapposizioni con Bot 3) */}
        <div className="absolute top-10 right-10 z-20 flex items-center gap-3">
          <div className="bg-slate-950/85 backdrop-blur-md border border-[#d4af37]/30 px-3 py-1.5 rounded-xl shadow-md text-[10px] font-black text-amber-400 tracking-wider">
            ROUND {gameState.roundNumber}
          </div>
          <button
            onClick={() => setGameMode('menu')}
            className="px-3 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/35 text-rose-200 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md"
          >
            ESCI
          </button>
        </div>

        {/* COMPAGNO (Bot 3 - Top Centrato) */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10">
          <PlayerWidget
            name="Bot 3"
            role="Compagno (S1)"
            cardCount={gameState.hands[2].length}
            isActive={gameState.currentPlayerIdx === 2}
          />
        </div>

        {/* Bot 2 (Sinistra - Posizionato in modo assoluto e specchiato simmetricamente a Bot 4) */}
        <div className="absolute left-10 top-[44%] -translate-y-1/2 z-10">
          <PlayerWidget
            name="Bot 2"
            role="Avversario (S2)"
            cardCount={gameState.hands[1].length}
            isActive={gameState.currentPlayerIdx === 1}
          />
        </div>

        {/* Pillola status in vetro dorato con animazione pop ad ogni cambio mossa (posizionata a top-[24%] per evitare sovrapposizioni con Bot 2 e Bot 4) */}
        <div 
          key={gameState.history.length}
          className="absolute left-1/2 top-[24%] -translate-x-1/2 -translate-y-1/2 z-20 px-6 py-2.5 bg-slate-950/80 backdrop-blur-md border border-[#d4af37]/30 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.6)] max-w-sm text-center animate-card-pop"
        >
          <span className="text-[#d4af37] font-extrabold text-xs tracking-wider drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {gameState.history[gameState.history.length - 1]}
          </span>
        </div>

        {/* AREA CENTRALE: Mazzo e Scarti (Centrata Assoluta al 44%) */}
        <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
          {/* Mazzo e Scarti */}
          <div className="flex items-center gap-10">
            {/* Mazzo (Tallone 3D Stack) */}
            <div className="relative group">
              {gameState.deck.length > 5 && (
                <>
                  <div className="absolute top-[1.5px] left-[1.5px] w-14 h-20 bg-[#0c1a30] rounded-md border border-[#d4af37]/10" />
                  <div className="absolute top-[3px] left-[3px] w-14 h-20 bg-[#0c1a30] rounded-md border border-[#d4af37]/15" />
                  <div className="absolute top-[4.5px] left-[4.5px] w-14 h-20 bg-[#0c1a30] rounded-md border border-[#d4af37]/20" />
                </>
              )}
              <div className="relative shadow-[1px_1px_0_#d4af37,_2px_2px_0_#d4af37,_3px_3px_0_#d4af37,_4px_4px_12px_rgba(0,0,0,0.75)] rounded-md">
                <CardView
                  card={null}
                  onClick={handleHumanDraw}
                />
              </div>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-400 tracking-wider whitespace-nowrap">
                {gameState.deck.length} CARTE
              </div>
            </div>

            {/* Scarti (Fanned con clic e drop abilitati) */}
            <div 
              className="relative flex items-center min-w-[85px] min-h-[90px] group cursor-pointer"
              onClick={handleScartiClick}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const srcIdx = Number(e.dataTransfer.getData("text/plain"));
                if (gameState.currentPlayerIdx === 0 && gameState.turnPhase === 'play') {
                  const card = gameState.hands[0][srcIdx];
                  handleDiscard(card);
                }
              }}
            >
              {gameState.discardPile.length === 0 ? (
                <div className="w-14 h-20 rounded-md border border-dashed border-[#d4af37]/20 flex items-center justify-center text-[8px] text-[#d4af37]/40 font-black tracking-widest">
                  SCARTI
                </div>
              ) : (
                gameState.discardPile.slice(-8).map((card, idx, arr) => {
                  const angle = (idx - (arr.length - 1) / 2) * 6;
                  return (
                    <div
                      key={card.id}
                      className="absolute transition-transform duration-200 hover:scale-105 hover:z-50"
                      style={{ 
                        left: `${idx * 14}px`, 
                        zIndex: idx,
                        transform: `rotate(${angle}deg)`
                      }}
                    >
                      <CardView card={card} />
                    </div>
                  );
                })
              )}
              {gameState.discardPile.length > 0 && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-black text-slate-400 tracking-wider whitespace-nowrap">
                  PILA ({gameState.discardPile.length})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bot 4 (Destra - Posizionato in modo assoluto e specchiato simmetricamente a Bot 2) */}
        <div className="absolute right-10 top-[44%] -translate-y-1/2 z-10">
          <PlayerWidget
            name="Bot 4"
            role="Avversario (S2)"
            cardCount={gameState.hands[3].length}
            isActive={gameState.currentPlayerIdx === 3}
          />
        </div>

        {/* GIOCATORE UMANO (Bottom Centrato Assoluto) */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10">
          {/* Header mano con pulsanti ordinamento */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => sortHand('value')}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-500 font-bold text-[9px] uppercase tracking-wider rounded-md transition-all active:scale-95 shadow"
            >
              Ordina Valore
            </button>
            
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              {gameState.currentPlayerIdx === 0 && gameMode === 'game' ? '★ IL TUO TURNO ★' : 'La tua mano'}
            </span>

            <button
              onClick={() => sortHand('suit')}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-500 font-bold text-[9px] uppercase tracking-wider rounded-md transition-all active:scale-95 shadow"
            >
              Ordina Seme
            </button>
          </div>

          {/* Carte in mano fanned con posizionamento assoluto ed animazione drag realistica */}
          {(() => {
            const hand = gameState.hands[0];
            const N = hand.length;
            const spacing = N <= 1 ? 62 : Math.min(48, 380 / (N - 1));
            const handWidth = N === 0 ? 0 : (N - 1) * spacing + 56;
            return (
              <div 
                className="relative h-24 overflow-visible transition-all duration-300"
                style={{ width: `${handWidth}px` }}
              >
                {hand.map((card, idx) => {
                  const isSelected = selectedCardIds.has(card.id);
                  const isDraggingThis = draggedIdx === idx;
                  const isHoveredTarget = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;
                  
                  return (
                    <div
                      key={card.id}
                      draggable={gameMode === 'game'}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOverCard(e, idx)}
                      onDragLeave={() => {
                        if (dragOverIdx === idx) setDragOverIdx(null);
                      }}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={() => {
                        setDraggedIdx(null);
                        setDragOverIdx(null);
                      }}
                      data-testid="hand-card"
                      data-card-id={card.id}
                      className={`absolute w-14 h-20 transition-all duration-300 ease-out cursor-grab active:cursor-grabbing select-none
                        ${isDraggingThis ? 'opacity-20 scale-95 z-0' : 'opacity-100'}
                        ${isHoveredTarget ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-md scale-105 z-40 shadow-2xl' : ''}
                        ${draggedIdx === null && !isDraggingThis ? 'hover:!-translate-y-4 hover:!z-50 hover:shadow-xl' : ''}
                      `}
                      style={{ 
                        left: `${idx * spacing}px`,
                        transform: isSelected ? 'translateY(-24px)' : undefined,
                        zIndex: isHoveredTarget ? 30 : idx + 10,
                      }}
                    >
                      <CardView
                        card={card}
                        onClick={() => toggleCardSelect(card.id)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 3. Colonna Destra (Meld Squadra 2) */}
      <MeldColumn
        title="SQUADRA 2"
        teamId={1}
        melds={gameState.teams[1].melds}
        titleColorClass="text-red-400"
        lastUpdatedMeld={lastUpdatedMeld}
        points={gameState.teams[1].points}
      />



      {/* MODAL BREAKDOWN PUNTEGGI DI FINE ROUND */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 animate-fade-in select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full text-center shadow-2xl relative m-4">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="text-amber-500" size={28} />
            </div>

            <h3 className="text-2xl font-extrabold tracking-wide text-amber-500 mb-1">FINE ROUND {gameState.roundNumber}</h3>
            <p className="text-xs text-slate-400 font-medium mb-6">Dettaglio calcolo punteggi del round</p>

            {/* Tabella dettagliata dei punti */}
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

            <button
              onClick={() => startNextRound(scoreResults.scores)}
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-black font-extrabold text-xs tracking-wider rounded-xl transition-all shadow-md active:scale-95"
            >
              <CheckCircle size={15} />
              Prosegui Partita
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
