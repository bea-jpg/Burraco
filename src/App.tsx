import React, { useState, useEffect, useRef } from 'react';
import {
  type GameState,
  createInitialState,
  getDefaultConfig,
  getPlayerTeamId,
  getPlayerDisplayName,
  drawFromDeck,
  takeDiscardPile,
  meldNewCombination,
  addToExistingMeld,
  discardCard,
  calculateRoundScores
} from './utils/gameEngine';
import { chooseDrawAction, playSingleBotMeld, chooseBotDiscard } from './utils/botPlayer';
import { CardView } from './components/CardView';
import { MeldColumn } from './components/MeldColumn';
import { MeldRow } from './components/MeldRow';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { MultiplayerService } from './services/multiplayerService';

import { type Card } from './types/card';
import confetti from 'canvas-confetti';
import { Award, CheckCircle, Globe, Bot, ArrowLeft, Copy, Check } from 'lucide-react';

export default function App() {
  const [gameMode, setGameMode] = useState<'menu' | 'multiplayer_lobby' | 'game'>('menu');
  const [isMultiplayer, setIsMultiplayer] = useState<boolean>(false);
  const [myPlayerIdx, setMyPlayerIdx] = useState<number>(0);
  const [initialRoomCode, setInitialRoomCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

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
  const multiplayerServiceRef = useRef<MultiplayerService>(new MultiplayerService());

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

  // Controlla se la pagina è stata aperta con parametro ?room=BURR-XXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInitialRoomCode(roomParam.toUpperCase());
      setGameMode('multiplayer_lobby');
    }
  }, []);

  // Configurazione listener di rete Multiplayer
  useEffect(() => {
    const service = multiplayerServiceRef.current;

    service.events.onStateSynced = (newState) => {
      setGameState(newState);
      setSelectedCardIds(new Set());
    };

    service.events.onGameStarted = (initialState, playerIdx) => {
      setGameState(initialState);
      setMyPlayerIdx(playerIdx);
      setIsMultiplayer(true);
      setGameMode('game');
    };

    service.events.onActionReceived = (action) => {
      if (!service.isHost) return;

      setGameState(prev => {
        let updatedState = prev;

        if (action.type === 'DRAW_DECK') {
          updatedState = drawFromDeck(prev, action.playerIdx);
        } else if (action.type === 'TAKE_DISCARD') {
          updatedState = takeDiscardPile(prev, action.playerIdx);
        } else if (action.type === 'MELD_NEW' && action.cards) {
          const res = meldNewCombination(prev, action.playerIdx, action.cards);
          if (res.success) updatedState = res.state;
        } else if (action.type === 'ADD_MELD' && action.cards && action.meldIdx !== undefined) {
          const res = addToExistingMeld(prev, action.playerIdx, action.meldIdx, action.cards);
          if (res.success) updatedState = res.state;
        } else if (action.type === 'DISCARD' && action.cardToDiscard) {
          const res = discardCard(prev, action.playerIdx, action.cardToDiscard, action.isClosingConfirm ?? true);
          if (res.success) updatedState = res.state;
        }

        service.syncState(updatedState);
        return updatedState;
      });
    };
  }, []);

  // Avvio di una nuova partita Single Player (contro i Bot)
  const startSinglePlayerGame = () => {
    multiplayerServiceRef.current.disconnect();
    setIsMultiplayer(false);
    setMyPlayerIdx(0);
    setGameState(createInitialState(getDefaultConfig(4)));
    setSelectedCardIds(new Set());
    setLastUpdatedMeld(null);
    setIsTransitioning(false);
    setShowScoreModal(false);
    setGameMode('game');
  };

  // Avvio partita Multiplayer dall'Host
  const handleStartMultiplayerGame = () => {
    const service = multiplayerServiceRef.current;
    const config = service.config || getDefaultConfig(4);
    const initial = createInitialState(config);
    service.startGame(initial);
    setGameState(initial);
    setMyPlayerIdx(0);
    setIsMultiplayer(true);
    setGameMode('game');
  };

  // Turno automatico dei Bot
  useEffect(() => {
    if (gameMode !== 'game' || gameState.roundOver) return;

    const activePlayerIdx = gameState.currentPlayerIdx;
    
    // In multiplayer solo l'Host guida i bot
    if (isMultiplayer && !multiplayerServiceRef.current.isHost) return;

    // Determina se il giocatore attivo è un bot
    const isBot = isMultiplayer
      ? Boolean(multiplayerServiceRef.current.players[activePlayerIdx]?.isBot)
      : activePlayerIdx !== 0;

    if (isBot) {
      if (isBotRunningRef.current) return;
      isBotRunningRef.current = true;
      setIsTransitioning(true);

      let currentTimer: any = null;

      const playStep = () => {
        if (!isBotRunningRef.current) return;
        
        let played = false;
        setGameState(prev => {
          const res = playSingleBotMeld(prev, activePlayerIdx);
          if (res.played) {
            played = true;
            const teamId = getPlayerTeamId(prev, activePlayerIdx);
            if (res.changedMeldIdx !== null) {
              setLastUpdatedMeld([teamId, res.changedMeldIdx]);
            }
            if (isMultiplayer) multiplayerServiceRef.current.syncState(res.state);
            return res.state;
          }
          return prev;
        });

        if (played) {
          currentTimer = setTimeout(playStep, 2200);
        } else {
          currentTimer = setTimeout(discardStep, 2200);
        }
      };

      const discardStep = () => {
        if (!isBotRunningRef.current) return;
        
        setGameState(prev => {
          const { card, isClosing } = chooseBotDiscard(prev, activePlayerIdx);
          const res = discardCard(prev, activePlayerIdx, card, isClosing);
          if (isMultiplayer) multiplayerServiceRef.current.syncState(res.state);
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
          let nextState: GameState;
          if (action === 'deck') {
            nextState = drawFromDeck(prev, activePlayerIdx);
          } else {
            nextState = takeDiscardPile(prev, activePlayerIdx);
          }
          if (isMultiplayer) multiplayerServiceRef.current.syncState(nextState);
          return nextState;
        });

        currentTimer = setTimeout(playStep, 2200);
      }, 2200);

      return () => {
        clearTimeout(currentTimer);
        isBotRunningRef.current = false;
        setIsTransitioning(false);
      };
    }
  }, [gameState.currentPlayerIdx, gameState.roundOver, gameMode, isMultiplayer]);

  // Gestione fine round
  useEffect(() => {
    if (gameState.roundOver) {
      setShowScoreModal(true);
      confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
    }
  }, [gameState.roundOver]);

  const isMyTurn = gameState.currentPlayerIdx === myPlayerIdx && !isTransitioning;

  // Gestione pescata
  const handleHumanDraw = () => {
    if (!isMyTurn || gameState.turnPhase !== 'draw') return;
    setLastUpdatedMeld(null);

    if (!isMultiplayer) {
      setGameState(prev => drawFromDeck(prev, myPlayerIdx));
    } else {
      if (multiplayerServiceRef.current.isHost) {
        const next = drawFromDeck(gameState, myPlayerIdx);
        setGameState(next);
        multiplayerServiceRef.current.syncState(next);
      } else {
        multiplayerServiceRef.current.sendAction({
          type: 'DRAW_DECK',
          playerIdx: myPlayerIdx
        });
      }
    }
  };

  // Gestione raccolta scarti
  const handleHumanCollect = () => {
    if (!isMyTurn || gameState.turnPhase !== 'draw') return;
    setLastUpdatedMeld(null);

    if (!isMultiplayer) {
      setGameState(prev => takeDiscardPile(prev, myPlayerIdx));
    } else {
      if (multiplayerServiceRef.current.isHost) {
        const next = takeDiscardPile(gameState, myPlayerIdx);
        setGameState(next);
        multiplayerServiceRef.current.syncState(next);
      } else {
        multiplayerServiceRef.current.sendAction({
          type: 'TAKE_DISCARD',
          playerIdx: myPlayerIdx
        });
      }
    }
  };

  // Toggle selezione carte della mano
  const toggleCardSelect = (cardId: string) => {
    if (!isMyTurn) return;
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
    if (!isMyTurn || gameState.turnPhase !== 'play' || selectedCardIds.size === 0) return;
    const hand = gameState.hands[myPlayerIdx];
    const selectedCards = hand.filter(card => selectedCardIds.has(card.id));
    
    if (!isMultiplayer) {
      const res = meldNewCombination(gameState, myPlayerIdx, selectedCards);
      if (res.success) {
        setGameState(res.state);
        setSelectedCardIds(new Set());
      } else {
        alert(res.msg);
      }
    } else {
      if (multiplayerServiceRef.current.isHost) {
        const res = meldNewCombination(gameState, myPlayerIdx, selectedCards);
        if (res.success) {
          setGameState(res.state);
          setSelectedCardIds(new Set());
          multiplayerServiceRef.current.syncState(res.state);
        } else {
          alert(res.msg);
        }
      } else {
        multiplayerServiceRef.current.sendAction({
          type: 'MELD_NEW',
          playerIdx: myPlayerIdx,
          cards: selectedCards
        });
        setSelectedCardIds(new Set());
      }
    }
  };

  // Aggiunta a calata esistente
  const handleAddToMeld = (meldIdx: number) => {
    if (!isMyTurn || gameState.turnPhase !== 'play' || selectedCardIds.size === 0) return;
    const hand = gameState.hands[myPlayerIdx];
    const selectedCards = hand.filter(card => selectedCardIds.has(card.id));
    
    if (!isMultiplayer) {
      const res = addToExistingMeld(gameState, myPlayerIdx, meldIdx, selectedCards);
      if (res.success) {
        setGameState(res.state);
        setSelectedCardIds(new Set());
      } else {
        alert(res.msg);
      }
    } else {
      if (multiplayerServiceRef.current.isHost) {
        const res = addToExistingMeld(gameState, myPlayerIdx, meldIdx, selectedCards);
        if (res.success) {
          setGameState(res.state);
          setSelectedCardIds(new Set());
          multiplayerServiceRef.current.syncState(res.state);
        } else {
          alert(res.msg);
        }
      } else {
        multiplayerServiceRef.current.sendAction({
          type: 'ADD_MELD',
          playerIdx: myPlayerIdx,
          meldIdx,
          cards: selectedCards
        });
        setSelectedCardIds(new Set());
      }
    }
  };

  // Scarto / Chiusura
  const handleDiscard = (card: Card) => {
    if (!isMyTurn || gameState.turnPhase !== 'play') return;

    if (!isMultiplayer) {
      const res = discardCard(gameState, myPlayerIdx, card, false);
      if (res.success) {
        setGameState(res.state);
        setSelectedCardIds(new Set());
      } else if (res.msg === "CONFIRM_REQUIRED") {
        const confirmClose = window.confirm("Sei pronto a CHIUDERE il round con questo scarto?");
        if (confirmClose) {
          const resConfirm = discardCard(gameState, myPlayerIdx, card, true);
          if (resConfirm.success) {
            setGameState(resConfirm.state);
            setSelectedCardIds(new Set());
          }
        }
      } else {
        alert(res.msg);
      }
    } else {
      if (multiplayerServiceRef.current.isHost) {
        const res = discardCard(gameState, myPlayerIdx, card, false);
        if (res.success) {
          setGameState(res.state);
          setSelectedCardIds(new Set());
          multiplayerServiceRef.current.syncState(res.state);
        } else if (res.msg === "CONFIRM_REQUIRED") {
          const confirmClose = window.confirm("Sei pronto a CHIUDERE il round con questo scarto?");
          if (confirmClose) {
            const resConfirm = discardCard(gameState, myPlayerIdx, card, true);
            if (resConfirm.success) {
              setGameState(resConfirm.state);
              setSelectedCardIds(new Set());
              multiplayerServiceRef.current.syncState(resConfirm.state);
            }
          }
        } else {
          alert(res.msg);
        }
      } else {
        multiplayerServiceRef.current.sendAction({
          type: 'DISCARD',
          playerIdx: myPlayerIdx,
          cardToDiscard: card
        });
        setSelectedCardIds(new Set());
      }
    }
  };

  // Gestione clic sul monte degli scarti (pesca o scarta)
  const handleScartiClick = () => {
    if (!isMyTurn) return;
    if (gameState.turnPhase === 'draw') {
      handleHumanCollect();
    } else {
      if (selectedCardIds.size !== 1) {
        alert("Seleziona esattamente 1 carta dalla tua mano da scartare, poi tocca gli scarti.");
        return;
      }
      const selectedCardId = Array.from(selectedCardIds)[0];
      const card = gameState.hands[myPlayerIdx].find(c => c.id === selectedCardId);
      if (card) handleDiscard(card);
    }
  };

  // Ordinamento mano
  const sortHand = (type: 'value' | 'suit') => {
    setGameState(prev => {
      const hand = [...prev.hands[myPlayerIdx]];
      
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
      nextHands[myPlayerIdx] = hand;
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
      const nextHand = [...prev.hands[myPlayerIdx]];
      if (srcIdx < 0 || srcIdx >= nextHand.length || destIdx < 0 || destIdx >= nextHand.length) return prev;
      
      const [card] = nextHand.splice(srcIdx, 1);
      nextHand.splice(destIdx, 0, card);
      
      const nextHands = [...prev.hands];
      nextHands[myPlayerIdx] = nextHand;
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
    const hand = gameState.hands[myPlayerIdx];
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
      const hand = gameState.hands[myPlayerIdx];
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

  // Drag and Drop Desktop
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData("text/plain", idx.toString());
    const target = e.currentTarget as HTMLDivElement;
    if (target.firstElementChild) {
      const clone = target.firstElementChild.cloneNode(true) as HTMLDivElement;
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
      e.dataTransfer.setDragImage(clone, 28, 40);
      setTimeout(() => clone.remove(), 0);
    }
    setTimeout(() => setDraggedIdx(idx), 0);
  };

  const handleDragOverCard = (e: React.DragEvent, destIdx: number) => {
    e.preventDefault();
    if (dragOverIdx !== destIdx) setDragOverIdx(destIdx);
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
    const nextPoints = gameState.teams.map((t, idx) => t.points + (scores[idx] || 0));
    const maxPoints = Math.max(...nextPoints);
    const targetPoints = gameState.config.targetPoints || 2000;

    if (maxPoints >= targetPoints) {
      const winnerIdx = nextPoints.indexOf(maxPoints);
      const winnerName = gameState.teams[winnerIdx]?.name || `Squadra ${winnerIdx + 1}`;
      alert(`PARTITA TERMINATA!
Vince ${winnerName} con ${maxPoints} punti!`);
      setGameMode('menu');
    } else {
      const nextConfig = {
        ...gameState.config,
        roundNumber: gameState.roundNumber + 1,
        teamPoints: nextPoints
      };
      const nextState = createInitialState(nextConfig);
      setGameState(nextState);
      setSelectedCardIds(new Set());
      setLastUpdatedMeld(null);
      setIsTransitioning(false);
      setShowScoreModal(false);

      if (isMultiplayer && multiplayerServiceRef.current.isHost) {
        multiplayerServiceRef.current.syncState(nextState);
      }
    }
  };

  // --- SCHERMATA 1: MENU PRINCIPALE ---
  if (gameMode === 'menu') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#07130b] text-white overflow-hidden select-none p-4 relative">
        {/* Glow circolare d'atmosfera */}
        <div className="absolute w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center max-w-md w-full p-6 sm:p-8 bg-slate-900/90 border border-amber-500/30 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.8)] relative backdrop-blur-xl">
          {/* Badge iconico */}
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-amber-400 text-3xl font-black">♦</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 mb-1">
            BURRACO PRO
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">
            Multiplayer Online & Bot AI Edition
          </p>
          
          <div className="flex flex-col gap-3">
            {/* Pulsante Single Player */}
            <button
              onClick={() => startSinglePlayerGame()}
              className="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-950/40 border border-emerald-400/40"
            >
              <Bot size={20} />
              Gioca contro i Bot
            </button>

            {/* Pulsante Multiplayer Online */}
            <button
              onClick={() => setGameMode('multiplayer_lobby')}
              className="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] text-slate-950 font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-950/40 border border-amber-300"
            >
              <Globe size={20} />
              Gioca Online con Amici (2-6 G.)
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-slate-800/80 text-[10px] text-slate-400 font-bold">
            <span>♠ Regole FIBUR Ufficiali</span>
            <span>•</span>
            <span>♥ 2 - 6 Giocatori</span>
            <span>•</span>
            <span>♦ Senza Registrazione</span>
          </div>
        </div>
      </div>
    );
  }

  // --- SCHERMATA 2: LOBBY MULTIPLAYER ---
  if (gameMode === 'multiplayer_lobby') {
    return (
      <MultiplayerLobby
        service={multiplayerServiceRef.current}
        onStartGame={handleStartMultiplayerGame}
        onBackToMenu={() => setGameMode('menu')}
        initialRoomCode={initialRoomCode}
      />
    );
  }

  // Elementi punteggio
  const scoreResults = calculateRoundScores(gameState);
  const activePlayerName = getPlayerDisplayName(gameState, gameState.currentPlayerIdx, myPlayerIdx);
  const playerCount = gameState.config?.playerCount || 4;

  return (
    <div className="flex h-screen w-screen flex-col bg-[#051108] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* ── HEADER TOP BAR ──────────────────────────────────────────────── */}
      <header className="h-10 sm:h-12 bg-slate-950/90 border-b border-amber-500/20 px-3 sm:px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (window.confirm("Vuoi abbandonare la partita e tornare al menù?")) {
                multiplayerServiceRef.current.disconnect();
                setGameMode('menu');
              }
            }}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg transition-all active:scale-95 border border-slate-800 text-xs flex items-center gap-1 font-bold"
            title="Esci al menù"
          >
            <ArrowLeft size={14} /> <span className="hidden sm:inline">Menù</span>
          </button>

          <span className="font-black text-xs sm:text-sm text-amber-400 tracking-wider flex items-center gap-1.5">
            BURRACO PRO
          </span>

          {isMultiplayer && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-amber-500/30 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-amber-300">
              <span>{multiplayerServiceRef.current.roomCode}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(multiplayerServiceRef.current.roomCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="p-0.5 hover:text-white"
                title="Copia codice stanza"
              >
                {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        {/* Info Round & Punteggi */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <span className="text-[10px] font-bold text-slate-400">
            RND {gameState.roundNumber}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-extrabold text-[11px] bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
              S1: {gameState.teams[0]?.points || 0}
            </span>
            <span className="text-red-400 font-extrabold text-[11px] bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30">
              S2: {gameState.teams[1]?.points || 0}
            </span>
          </div>
        </div>
      </header>

      {/* ── CORPO PRINCIPALE: DUAL LAYOUT ────────────────────────────────── */}
      {!isPortrait ? (
        /* ══════════════════════════════════════════════════════════════════
           LAYOUT 1: LANDSCAPE & DESKTOP (3 Colonne Ottimizzate)
        ══════════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-row overflow-hidden relative">
          
          {/* Colonna Sinistra: Squadra 1 */}
          <MeldColumn
            title="SQUADRA 1 (Noi)"
            teamId={0}
            melds={gameState.teams[0]?.melds || []}
            titleColorClass="text-emerald-400"
            points={gameState.teams[0]?.points || 0}
            lastUpdatedMeld={lastUpdatedMeld}
            onMeldClick={isMyTurn && gameState.turnPhase === 'play' ? handleAddToMeld : undefined}
            actionButton={
              isMyTurn && gameState.turnPhase === 'play' ? (
                <button
                  onClick={handleNewMeld}
                  disabled={selectedCardIds.size === 0}
                  className="w-full py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-30 disabled:pointer-events-none text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-md active:scale-95 border border-emerald-400/40"
                >
                  + Nuova Calata ({selectedCardIds.size})
                </button>
              ) : undefined
            }
          />

          {/* Tavolo Verde Centrale */}
          <div className="flex-1 flex flex-col bg-radial from-[#0d2a18] via-[#07180e] to-[#040e08] relative border-x border-slate-900/80 overflow-hidden">
            
            {/* Avatar Giocatori in Alto */}
            <div className="shrink-0 flex items-center justify-around py-1.5 px-3 border-b border-slate-900/40 bg-black/20">
              {Array.from({ length: playerCount }).map((_, pIdx) => {
                if (pIdx === myPlayerIdx) return null;
                const pName = getPlayerDisplayName(gameState, pIdx, myPlayerIdx);
                const isCurrent = gameState.currentPlayerIdx === pIdx;
                const teamId = getPlayerTeamId(gameState, pIdx);
                const myTeamId = getPlayerTeamId(gameState, myPlayerIdx);
                const isTeammate = teamId === myTeamId;

                return (
                  <div
                    key={pIdx}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border transition-all ${
                      isCurrent
                        ? "bg-amber-500/20 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse"
                        : "bg-slate-950/60 border-slate-800/80"
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] text-white ${
                      isTeammate ? "bg-emerald-600" : "bg-red-600"
                    }`}>
                      {pName.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-extrabold text-white truncate max-w-[80px]">
                        {pName}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400">
                        {gameState.hands[pIdx]?.length || 0} carte
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mazzo + Scarti + Status Centrale */}
            <div className="flex-1 flex flex-col items-center justify-center gap-3 relative py-2">
              <div className="px-4 py-1 bg-slate-950/90 border border-amber-500/30 rounded-full text-[9px] font-bold text-amber-300 shadow-lg animate-card-pop">
                {gameState.history[gameState.history.length - 1]}
              </div>

              <div className="flex items-center gap-8 sm:gap-12">
                {/* Mazzo */}
                <div className="relative group flex flex-col items-center">
                  {gameState.deck.length > 3 && (
                    <>
                      <div className="absolute top-[1.5px] left-[1.5px] w-14 h-20 bg-[#0c1a30] rounded-md border border-amber-500/10" />
                      <div className="absolute top-[3px] left-[3px] w-14 h-20 bg-[#0c1a30] rounded-md border border-amber-500/15" />
                    </>
                  )}
                  <div className="relative shadow-[1px_1px_0_#d4af37,_2px_2px_0_#d4af37,_3px_3px_8px_rgba(0,0,0,0.75)] rounded-md">
                    <CardView card={null} onClick={handleHumanDraw} size="normal" />
                  </div>
                  <div className="text-[8px] font-black text-slate-400 mt-1">
                    {gameState.deck.length} CARTE
                  </div>
                </div>

                {/* Scarti */}
                <div
                  className="relative flex items-center min-w-[65px] min-h-[85px] cursor-pointer"
                  onClick={handleScartiClick}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const srcIdx = Number(e.dataTransfer.getData("text/plain"));
                    if (isMyTurn && gameState.turnPhase === 'play') {
                      const card = gameState.hands[myPlayerIdx][srcIdx];
                      if (card) handleDiscard(card);
                    }
                  }}
                >
                  {gameState.discardPile.length === 0 ? (
                    <div className="w-14 h-20 rounded-md border border-dashed border-amber-500/25 flex items-center justify-center text-[7.5px] text-amber-400/40 font-black tracking-widest">
                      SCARTI
                    </div>
                  ) : (
                    gameState.discardPile.slice(-6).map((card, idx, arr) => {
                      const angle = (idx - (arr.length - 1) / 2) * 6;
                      return (
                        <div key={card.id} className="absolute transition-transform duration-200"
                          style={{ left: `${idx * 12}px`, zIndex: idx, transform: `rotate(${angle}deg)` }}>
                          <CardView card={card} size="normal" />
                        </div>
                      );
                    })
                  )}
                  <div className="text-[8px] font-black text-slate-400 absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    {gameState.discardPile.length > 0 ? `PILA (${gameState.discardPile.length})` : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Mano Giocatore in Fondo */}
            <div className="shrink-0 flex flex-col justify-end pb-3 bg-black/40 border-t border-slate-900/60" style={{ overflow: 'visible' }}>
              <div className="flex items-center justify-between px-4 py-1">
                <button onClick={() => sortHand('value')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-400 font-bold text-[8px] uppercase tracking-wider rounded-md active:scale-95 shadow">
                  Ordina Valore
                </button>

                <span className={`text-[9px] uppercase px-3 py-1 rounded-full ${
                  isMyTurn
                    ? 'text-amber-300 font-black tracking-widest bg-amber-500/15 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
                    : 'text-slate-400 font-bold tracking-widest border border-transparent'
                }`}>
                  {isMyTurn ? '★ IL TUO TURNO ★' : `Turno di ${activePlayerName}`}
                </span>

                <button onClick={() => sortHand('suit')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-400 font-bold text-[8px] uppercase tracking-wider rounded-md active:scale-95 shadow">
                  Ordina Seme
                </button>
              </div>

              {(() => {
                const hand = gameState.hands[myPlayerIdx] || [];
                const N = hand.length;
                const maxFanWidth = isMobile ? 300 : 420;
                const spacing = N <= 1 ? 52 : Math.min(44, maxFanWidth / (N - 1));
                const handWidth = N === 0 ? 0 : (N - 1) * spacing + 56;
                return (
                  <div data-testid="hand-fan" className="relative h-22 overflow-visible mx-auto" style={{ width: `${handWidth}px` }}>
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
                          className={`absolute w-14 h-20 transition-all duration-200 ease-out cursor-grab select-none
                            ${isDraggingThis ? 'opacity-20 scale-95 z-0' : 'opacity-100'}
                            ${isHoveredTarget ? 'ring-2 ring-amber-400 rounded-md scale-105 z-40 shadow-2xl' : ''}
                            ${isSelected ? 'ring-2 ring-amber-400 rounded-md' : ''}`}
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

          {/* Colonna Destra: Squadra 2 */}
          <MeldColumn
            title="SQUADRA 2 (Avv.)"
            teamId={1}
            melds={gameState.teams[1]?.melds || []}
            titleColorClass="text-red-400"
            points={gameState.teams[1]?.points || 0}
            lastUpdatedMeld={lastUpdatedMeld}
          />
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════
           LAYOUT 2: PORTRAIT MOBILE
        ══════════════════════════════════════════════════════════════════ */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#040f08] select-none">
          
          {/* Top Bar Bot / Giocatori */}
          <div className="shrink-0 flex items-center justify-between px-2.5 py-1.5 bg-slate-950/95 border-b border-slate-900 gap-1.5 overflow-x-auto">
            {Array.from({ length: playerCount }).map((_, pIdx) => {
              if (pIdx === myPlayerIdx) return null;
              const pName = getPlayerDisplayName(gameState, pIdx, myPlayerIdx);
              const isCurrent = gameState.currentPlayerIdx === pIdx;
              const teamId = getPlayerTeamId(gameState, pIdx);
              const myTeamId = getPlayerTeamId(gameState, myPlayerIdx);
              const isTeammate = teamId === myTeamId;

              return (
                <div
                  key={pIdx}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] shrink-0 ${
                    isCurrent
                      ? "bg-amber-500/25 border-amber-400 text-amber-300 animate-pulse font-black"
                      : isTeammate
                      ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-300"
                      : "bg-red-950/40 border-red-600/40 text-red-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isTeammate ? "bg-emerald-400" : "bg-red-400"}`} />
                  <span className="font-bold">{pName}</span>
                  <span className="text-[7.5px] opacity-75">({gameState.hands[pIdx]?.length || 0})</span>
                </div>
              );
            })}
          </div>

          {/* Calate Squadra 2 (Avversari) */}
          <div className="flex-1 min-h-[100px] max-h-[35%] bg-[#030b06] border-b border-slate-900/60 flex flex-col overflow-hidden">
            <MeldRow
              teamId={1}
              melds={gameState.teams[1]?.melds || []}
              titleColorClass="text-red-400"
              teamLabel="👹 Avversari"
              points={gameState.teams[1]?.points || 0}
              lastUpdatedMeld={lastUpdatedMeld}
            />
          </div>

          {/* Zona Centrale: Mazzo + Scarti */}
          <div className="shrink-0 flex items-center justify-center gap-8 py-2 px-4 bg-[#071a0f] relative border-b border-slate-900/40">
            <div key={gameState.history.length}
              className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-0.5 bg-slate-950/90 border border-amber-500/25 rounded-full text-[8.5px] font-bold text-amber-400 whitespace-nowrap max-w-[65vw] truncate animate-card-pop shadow-md">
              {gameState.history[gameState.history.length - 1]}
            </div>

            {/* Mazzo */}
            <div className="relative group mt-2 flex flex-col items-center">
              {gameState.deck.length > 3 && (
                <>
                  <div className="absolute top-[1.5px] left-[1.5px] w-14 h-20 bg-[#0c1a30] rounded-md border border-amber-500/10" />
                  <div className="absolute top-[3px] left-[3px] w-14 h-20 bg-[#0c1a30] rounded-md border border-amber-500/15" />
                </>
              )}
              <div className="relative shadow-[1px_1px_0_#d4af37,_2px_2px_0_#d4af37,_3px_3px_8px_rgba(0,0,0,0.75)] rounded-md">
                <CardView card={null} onClick={handleHumanDraw} size="normal" />
              </div>
              <div className="text-center text-[8px] font-black text-slate-400 mt-1 whitespace-nowrap">
                {gameState.deck.length} carte
              </div>
            </div>

            {/* Scarti */}
            <div className="relative flex items-center cursor-pointer mt-2" style={{ minWidth: '60px', minHeight: '82px' }}
              onClick={handleScartiClick}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const srcIdx = Number(e.dataTransfer.getData("text/plain"));
                if (isMyTurn && gameState.turnPhase === 'play') {
                  const card = gameState.hands[myPlayerIdx][srcIdx];
                  if (card) handleDiscard(card);
                }
              }}>
              {gameState.discardPile.length === 0 ? (
                <div className="w-14 h-20 rounded-md border border-dashed border-amber-500/20 flex items-center justify-center text-[7.5px] text-amber-400/40 font-black tracking-widest">
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

          {/* Calate Squadra 1 (Noi) */}
          <div className="flex-1 min-h-[110px] max-h-[45%] bg-[#040f08]/90 border-b border-slate-900/60 flex flex-col overflow-hidden">
            <MeldRow
              teamId={0}
              melds={gameState.teams[0]?.melds || []}
              titleColorClass="text-emerald-400"
              teamLabel="👥 Noi"
              points={gameState.teams[0]?.points || 0}
              onMeldClick={isMyTurn && gameState.turnPhase === 'play' ? handleAddToMeld : undefined}
              lastUpdatedMeld={lastUpdatedMeld}
              actionButton={
                isMyTurn && gameMode === 'game' ? (
                  <button
                    onClick={() => {
                      if (gameState.turnPhase !== 'play') {
                        alert("Devi prima PESCARE una carta dal mazzo o dagli scarti!");
                        return;
                      }
                      if (selectedCardIds.size === 0) {
                        alert("Seleziona prima dalla tua mano le carte da calare!");
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

          {/* Mano Giocatore in Fondo */}
          <div className="shrink-0 flex flex-col justify-end pb-2 bg-[#071a0f]" style={{ overflow: 'visible' }}>
            <div className="flex items-center justify-between px-2 py-1 shrink-0 gap-1">
              <button onClick={() => sortHand('value')}
                className="px-2 py-1 bg-slate-900 border border-amber-500/25 text-amber-400 font-bold text-[8px] uppercase tracking-wide rounded-md transition-all active:scale-95">
                Valore
              </button>

              {/* Azione contestuale centrale */}
              {isMyTurn && gameMode === 'game' ? (
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
                        const card = gameState.hands[myPlayerIdx]?.find(c => c.id === selectedCardId);
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
                  Turno di {activePlayerName}
                </span>
              )}

              <button onClick={() => sortHand('suit')}
                className="px-2 py-1 bg-slate-900 border border-amber-500/25 text-amber-400 font-bold text-[8px] uppercase tracking-wide rounded-md transition-all active:scale-95">
                Seme
              </button>
            </div>

            {/* Carte in mano */}
            {(() => {
              const hand = gameState.hands[myPlayerIdx] || [];
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

      {/* ── MODAL BREAKDOWN PUNTEGGI DI FINE ROUND ─────────────────────── */}
      {showScoreModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 animate-fade-in select-none p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-lg w-full text-center shadow-2xl relative">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="text-amber-400" size={28} />
            </div>

            <h3 className="text-2xl font-extrabold tracking-wide text-amber-400 mb-1">
              FINE ROUND {gameState.roundNumber}
            </h3>
            <p className="text-xs text-slate-400 font-medium mb-6">Dettaglio calcolo punteggi del round</p>

            <div className="grid grid-cols-3 gap-y-3 text-xs text-left mb-8 border-b border-t border-slate-800 py-4 px-2">
              <div className="font-bold text-slate-400">Dettaglio Punti</div>
              <div className="font-bold text-center text-emerald-400">S1 (Noi)</div>
              <div className="font-bold text-center text-red-400">S2 (Avversari)</div>

              <div className="text-slate-300">Valore carte calate:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0]?.meldedCardsValue || 0}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1]?.meldedCardsValue || 0}</div>

              <div className="text-slate-300">Bonus Burrachi:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0]?.burracoBonus || 0}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1]?.burracoBonus || 0}</div>

              <div className="text-slate-300 font-medium">Bonus Chiusura:</div>
              <div className="text-center font-bold text-emerald-500">+{scoreResults.details[0]?.closingBonus || 0}</div>
              <div className="text-center font-bold text-red-500">+{scoreResults.details[1]?.closingBonus || 0}</div>

              <div className="text-slate-300 font-medium">Penale Pozzetto:</div>
              <div className="text-center font-bold text-emerald-500">{scoreResults.details[0]?.pozzettoPenalty || 0}</div>
              <div className="text-center font-bold text-red-500">{scoreResults.details[1]?.pozzettoPenalty || 0}</div>

              <div className="text-slate-300 font-medium">Carte in mano:</div>
              <div className="text-center font-bold text-emerald-500">{scoreResults.details[0]?.handPenalty || 0}</div>
              <div className="text-center font-bold text-red-500">{scoreResults.details[1]?.handPenalty || 0}</div>

              <div className="font-extrabold text-slate-200 mt-2 border-t border-slate-800/80 pt-2">Totale Round:</div>
              <div className="text-center font-black text-emerald-400 mt-2 border-t border-slate-800/80 pt-2 text-sm">
                {scoreResults.details[0]?.total > 0 ? `+${scoreResults.details[0]?.total}` : scoreResults.details[0]?.total || 0}
              </div>
              <div className="text-center font-black text-red-400 mt-2 border-t border-slate-800/80 pt-2 text-sm">
                {scoreResults.details[1]?.total > 0 ? `+${scoreResults.details[1]?.total}` : scoreResults.details[1]?.total || 0}
              </div>
            </div>

            <button
              onClick={() => startNextRound(scoreResults.scores)}
              className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-extrabold text-sm uppercase tracking-widest rounded-2xl shadow-xl transition-all border border-emerald-400/40"
            >
              <CheckCircle size={18} /> Continua Prossimo Round
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
