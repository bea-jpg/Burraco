import React, { useState } from "react";
import { Copy, Check, Users, Play, Bot, ArrowLeft, Send, Sparkles, Shield, UserCheck, MessageCircle } from "lucide-react";
import { MultiplayerService, type NetworkPlayer, type ChatMessage } from "../services/multiplayerService";
import type { GameConfig } from "../utils/gameEngine";

interface MultiplayerLobbyProps {
  service: MultiplayerService;
  onStartGame: () => void;
  onBackToMenu: () => void;
  initialRoomCode?: string;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  service,
  onStartGame,
  onBackToMenu,
  initialRoomCode = ""
}) => {
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("burraco_player_name") || "");
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode);
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<number>(4);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [roomPlayers, setRoomPlayers] = useState<NetworkPlayer[]>(service.players);
  const [currentConfig, setCurrentConfig] = useState<GameConfig | null>(service.config);

  // Regole sintetiche per numero di giocatori
  const ruleDescriptions: Record<number, { title: string; desc: string; decks: string; pozzetti: string }> = {
    2: {
      title: "2 Giocatori (Testa a Testa)",
      desc: "Sfida 1 contro 1. 2 mazzi, 11 carte a testa. Chiusura con almeno un Burraco.",
      decks: "2 Mazzi (108 carte)",
      pozzetti: "2 Pozzetti da 11 carte"
    },
    3: {
      title: "3 Giocatori (Regola FIBUR)",
      desc: "1 Singolo contro 1 Coppia. Il 1° a finire le carte prende il pozzetto grande (18 carte) e gioca solo.",
      decks: "2 Mazzi (108 carte)",
      pozzetti: "1 da 18 + 1 da 11 carte"
    },
    4: {
      title: "4 Giocatori (Coppie Standard)",
      desc: "Burraco classico a 2 coppie contrapposte (G1+G3 vs G2+G4).",
      decks: "2 Mazzi (108 carte)",
      pozzetti: "2 Pozzetti da 11 carte"
    },
    5: {
      title: "5 Giocatori (3 Mazzi)",
      desc: "3 mazzi con 6 Jolly. 1 Singolo contro 2 Coppie, 11 carte a testa.",
      decks: "3 Mazzi (162 carte)",
      pozzetti: "1 da 18 + 1 da 11 carte"
    },
    6: {
      title: "6 Giocatori (2 Squadre da 3)",
      desc: "3 mazzi con 6 Jolly. 2 Squadre da 3 giocatori seduti alternati.",
      decks: "3 Mazzi (162 carte)",
      pozzetti: "2 Pozzetti da 18 carte"
    }
  };

  // Salva nome giocatore
  const saveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem("burraco_player_name", name.trim());
  };

  // Creazione Stanza
  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setErrorMessage("Inserisci il tuo nome per creare la stanza.");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    saveName(playerName);

    try {
      const generatedCode = MultiplayerService.generateRoomCode();
      await service.createRoom(generatedCode, playerName, selectedPlayerCount, {
        onRoomUpdated: (players, cfg) => {
          setRoomPlayers([...players]);
          if (cfg) setCurrentConfig(cfg);
          setErrorMessage(null);
        },
        onChatMessage: (msg) => {
          setChatMessages(prev => [...prev.slice(-15), msg]);
        },
        onError: (err) => {
          setErrorMessage(err);
          setIsLoading(false);
        }
      });
      setRoomPlayers([...service.players]);
      setCurrentConfig(service.config);
      setIsLoading(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore durante la creazione della stanza.");
      setIsLoading(false);
    }
  };

  // Accesso Stanza
  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setErrorMessage("Inserisci il tuo nome per accedere.");
      return;
    }
    if (!roomCodeInput.trim()) {
      setErrorMessage("Inserisci il codice della stanza.");
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    saveName(playerName);

    try {
      await service.joinRoom(roomCodeInput.trim().toUpperCase(), playerName, {
        onRoomUpdated: (players, cfg) => {
          setRoomPlayers([...players]);
          if (cfg) setCurrentConfig(cfg);
          setErrorMessage(null);
        },
        onChatMessage: (msg) => {
          setChatMessages(prev => [...prev.slice(-15), msg]);
        },
        onGameStarted: () => {
          onStartGame();
        },
        onError: (err) => {
          setErrorMessage(err);
          setIsLoading(false);
        }
      });
      setRoomPlayers([...service.players]);
      setCurrentConfig(service.config);
      setIsLoading(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Impossibile connettersi alla stanza.");
      setIsLoading(false);
    }
  };

  // Copia Codice
  const copyCode = () => {
    navigator.clipboard.writeText(service.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Copia Link Invito
  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${service.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Invia Chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    service.sendChat(chatInput.trim());
    setChatInput("");
  };

  // Invia Emoji
  const handleQuickEmoji = (emoji: string) => {
    service.sendEmoji(emoji);
    service.sendChat(emoji);
  };

  const isConnectedToRoom = Boolean(service.roomCode && roomPlayers.length > 0);
  const targetCount = currentConfig?.playerCount || service.config?.playerCount || selectedPlayerCount;
  const isHost = service.isHost;
  const canStart = isHost && roomPlayers.length === targetCount;

  // --- VISTA 1: LOBBY D'ATTESA STANZA ATTIVA ---
  if (isConnectedToRoom) {
    return (
      <div className="fixed inset-0 bg-[#06120b] z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto select-none">
        <div className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-3xl p-4 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col gap-5">
          
          {/* Header Stanza */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  service.disconnect();
                  onBackToMenu();
                }}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all active:scale-95 border border-slate-700"
                title="Esci dalla stanza"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Shield size={12} className="text-amber-400" /> Stanza Burraco Online
                </span>
                <h2 className="text-lg sm:text-2xl font-black text-white tracking-wide">
                  Lobby d'Attesa ({roomPlayers.length}/{targetCount} Giocatori)
                </h2>
              </div>
            </div>

            {/* Codice Stanza Badge */}
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-inner">
                <span className="text-xs sm:text-sm font-black text-amber-400 tracking-widest font-mono">
                  {service.roomCode}
                </span>
                <button
                  onClick={copyCode}
                  className="p-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-md transition-all active:scale-95"
                  title="Copia codice"
                >
                  {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={copyLink}
                className="text-[9px] font-bold text-amber-400/80 hover:text-amber-300 transition-colors flex items-center gap-1 underline"
              >
                {copiedLink ? "✓ Link copiato!" : "🔗 Copia link di invito"}
              </button>
            </div>
          </div>

          {/* Info Modalità & Regole */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-black text-amber-300 uppercase tracking-wide">
                {ruleDescriptions[targetCount]?.title}
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {ruleDescriptions[targetCount]?.desc}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded-lg">
                📦 {ruleDescriptions[targetCount]?.decks}
              </span>
              <span className="text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded-lg">
                🎴 {ruleDescriptions[targetCount]?.pozzetti}
              </span>
            </div>
          </div>

          {/* Griglia Giocatori (Slot da 2 a 6) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Array.from({ length: targetCount }).map((_, slotIdx) => {
              const player = roomPlayers[slotIdx];
              const isMe = player?.playerIdx === service.myPlayerIdx;
              const isSlotHost = player?.isHost;
              
              // Squadra associata
              const teamLabel = targetCount === 2
                ? `Singolo ${slotIdx + 1}`
                : targetCount === 3
                ? (slotIdx === 0 ? "Singolo" : "Coppia")
                : (slotIdx % 2 === 0 ? "Squadra 1" : "Squadra 2");
              const teamColor = (slotIdx % 2 === 0 || (targetCount === 3 && slotIdx === 0))
                ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/30"
                : "text-red-400 border-red-500/30 bg-red-950/30";

              return (
                <div
                  key={slotIdx}
                  className={`rounded-2xl p-3.5 border transition-all flex items-center justify-between gap-2.5 ${
                    player
                      ? isMe
                        ? "bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-400/30"
                        : "bg-slate-950/80 border-slate-800"
                      : "bg-slate-950/30 border-dashed border-slate-800 text-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      player
                        ? player.isBot
                          ? "bg-slate-800 text-slate-400 border border-slate-700"
                          : "bg-gradient-to-br from-amber-500 to-teal-600 text-slate-950 font-extrabold shadow-sm"
                        : "bg-slate-900 border border-slate-800 text-slate-700"
                    }`}>
                      {player ? (player.isBot ? "🤖" : player.name.charAt(0).toUpperCase()) : slotIdx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-extrabold text-white text-xs truncate">
                          {player ? player.name : "In attesa..."}
                        </span>
                        {isMe && (
                          <span className="text-[8px] font-black bg-amber-500 text-slate-950 px-1 rounded uppercase tracking-wider">
                            TU
                          </span>
                        )}
                        {isSlotHost && (
                          <span className="text-[8px] font-black bg-emerald-600 text-white px-1 rounded uppercase tracking-wider">
                            HOST
                          </span>
                        )}
                      </div>
                      <span className={`text-[9px] font-bold inline-block mt-0.5 px-1.5 py-0.2 rounded border ${teamColor}`}>
                        {teamLabel}
                      </span>
                    </div>
                  </div>

                  {player ? (
                    <UserCheck size={16} className="text-emerald-400 shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Chat & Emoji Bar */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <MessageCircle size={12} className="text-amber-400" /> Chat di Stanza
              </span>
              <div className="flex items-center gap-1.5">
                {["👋", "🔥", "🏆", "😎", "♠️", "♥️", "♦️", "♣️"].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleQuickEmoji(emoji)}
                    className="p-1 hover:scale-125 transition-transform text-sm active:scale-95"
                    title={`Invia ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Ultimi messaggi */}
            {chatMessages.length > 0 && (
              <div className="max-h-20 overflow-y-auto space-y-1 text-xs px-1 custom-scrollbar">
                {chatMessages.map(msg => (
                  <div key={msg.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-black text-amber-400 shrink-0">{msg.senderName}:</span>
                    <span className="text-slate-200">{msg.text}</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSendChat} className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Scrivi un messaggio veloce..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl transition-all active:scale-95 font-bold shrink-0"
              >
                <Send size={14} />
              </button>
            </form>
          </div>

          {/* Footer Azioni */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 pt-4">
            {isHost ? (
              <>
                <button
                  onClick={() => {
                    service.fillEmptySlotsWithBots();
                    setRoomPlayers([...service.players]);
                  }}
                  disabled={roomPlayers.length >= targetCount}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none border border-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Bot size={15} /> Riempi posti vuoti con Bot
                </button>

                <button
                  onClick={() => {
                    if (!canStart) return;
                    onStartGame();
                  }}
                  disabled={!canStart}
                  className={`w-full sm:w-auto px-6 py-3 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                    canStart
                      ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white animate-pulse active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer"
                      : "bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed"
                  }`}
                >
                  <Play size={16} fill="currentColor" />
                  {canStart ? "AVVIA PARTITA MULTIPLAYER" : `IN ATTESA DI ${targetCount - roomPlayers.length} GIOCATORI`}
                </button>
              </>
            ) : (
              <div className="w-full text-center py-2 text-xs font-bold text-slate-400 animate-pulse flex items-center justify-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                In attesa che l'Host avvii la partita...
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // --- VISTA 2: FORM CREA / UNISCITI A STANZA ---
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-8 shadow-2xl relative flex flex-col gap-5">
        
        {/* Intestazione */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToMenu}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all active:scale-95 border border-slate-700"
              title="Torna al menù"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                Multiplayer Online P2P
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">Gioca con gli Amici</h2>
            </div>
          </div>
        </div>

        {/* Tab switch: Crea vs Unisciti */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => { setTab('create'); setErrorMessage(null); }}
            className={`py-2.5 rounded-xl font-extrabold text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
              tab === 'create'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} /> Crea Nuova Stanza
          </button>
          <button
            onClick={() => { setTab('join'); setErrorMessage(null); }}
            className={`py-2.5 rounded-xl font-extrabold text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
              tab === 'join'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={14} /> Unisciti con Codice
          </button>
        </div>

        {/* Input Nome Giocatore */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Il tuo Nome Giocatore
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => saveName(e.target.value)}
            maxLength={18}
            placeholder="Es. Marco, Beatrice..."
            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/60 font-bold"
          />
        </div>

        {/* CONTENUTO TAB 1: CREA STANZA */}
        {tab === 'create' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Numero di Giocatori (2 - 6)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[2, 3, 4, 5, 6].map(num => (
                  <button
                    key={num}
                    onClick={() => setSelectedPlayerCount(num)}
                    className={`py-2.5 rounded-xl font-black text-xs transition-all border ${
                      selectedPlayerCount === num
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md scale-105 ring-1 ring-amber-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {num} G.
                  </button>
                ))}
              </div>
            </div>

            {/* Info Regole Modalità Scelta */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 text-xs">
              <span className="font-black text-amber-400 block mb-1">
                {ruleDescriptions[selectedPlayerCount]?.title}
              </span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {ruleDescriptions[selectedPlayerCount]?.desc}
              </p>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-900 text-[10px] text-slate-400 font-bold">
                <span>📦 {ruleDescriptions[selectedPlayerCount]?.decks}</span>
                <span>•</span>
                <span>🎴 {ruleDescriptions[selectedPlayerCount]?.pozzetti}</span>
              </div>
            </div>

            {/* Pulsante Crea */}
            <button
              onClick={handleCreateRoom}
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles size={16} />
              {isLoading ? "Creazione in corso..." : "CREA STANZA & GENERA CODICE"}
            </button>
          </div>
        )}

        {/* CONTENUTO TAB 2: UNISCITI A STANZA */}
        {tab === 'join' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Codice Stanza
              </label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="Es. BURR-8492"
                maxLength={12}
                className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base text-amber-400 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 font-mono font-black tracking-widest text-center"
              />
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Inserisci il codice che ti ha inviato l'amico che ha creato la stanza.
            </p>

            <button
              onClick={handleJoinRoom}
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Users size={16} />
              {isLoading ? "Connessione in corso..." : "ENTRA NELLA STANZA"}
            </button>
          </div>
        )}

        {/* Errore Alert */}
        {errorMessage && (
          <div className="bg-red-950/80 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl text-center font-bold animate-shake">
            ⚠️ {errorMessage}
          </div>
        )}

      </div>
    </div>
  );
};
