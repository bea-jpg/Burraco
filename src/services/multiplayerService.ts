import { Peer, type DataConnection } from "peerjs";
import type { GameConfig, GameState } from "../utils/gameEngine";
import type { Card } from "../types/card";

export interface NetworkPlayer {
  peerId: string;
  playerIdx: number;
  name: string;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
}

export type NetworkActionType =
  | 'DRAW_DECK'
  | 'TAKE_DISCARD'
  | 'MELD_NEW'
  | 'ADD_MELD'
  | 'DISCARD'
  | 'REORDER_HAND';

export interface NetworkAction {
  type: NetworkActionType;
  playerIdx: number;
  cards?: Card[];
  meldIdx?: number;
  cardToDiscard?: Card;
  isClosingConfirm?: boolean;
}

export interface ChatMessage {
  id: string;
  senderIdx: number;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface EmojiReaction {
  playerIdx: number;
  emoji: string;
}

export type NetworkMessage =
  | { type: 'JOIN_REQUEST'; name: string }
  | { type: 'JOIN_ACCEPTED'; playerIdx: number; config: GameConfig; players: NetworkPlayer[] }
  | { type: 'ROOM_UPDATE'; config: GameConfig; players: NetworkPlayer[] }
  | { type: 'GAME_START'; state: GameState; config: GameConfig }
  | { type: 'PLAYER_ACTION'; action: NetworkAction }
  | { type: 'STATE_SYNC'; state: GameState }
  | { type: 'CHAT'; message: ChatMessage }
  | { type: 'EMOJI'; reaction: EmojiReaction }
  | { type: 'ERROR'; message: string };

export interface MultiplayerEventMap {
  connected: (myPeerId: string) => void;
  roomUpdated: (players: NetworkPlayer[], config: GameConfig) => void;
  gameStarted: (state: GameState, myPlayerIdx: number) => void;
  stateSynced: (state: GameState) => void;
  actionReceived: (action: NetworkAction) => void;
  chatMessage: (message: ChatMessage) => void;
  emojiReaction: (reaction: EmojiReaction) => void;
  error: (err: string) => void;
  disconnected: () => void;
}

export class MultiplayerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private listeners: Map<keyof MultiplayerEventMap, Set<any>> = new Map();
  
  public isHost = false;
  public roomCode = "";
  public myPlayerIdx = 0;
  public myName = "";
  public players: NetworkPlayer[] = [];
  public config: GameConfig | null = null;

  // Prefisso per isolare le stanze Burraco Pro su PeerServer
  private static PEER_PREFIX = "burraco-pro-room-";

  public on<K extends keyof MultiplayerEventMap>(event: K, handler: MultiplayerEventMap[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  public emit<K extends keyof MultiplayerEventMap>(event: K, ...args: Parameters<MultiplayerEventMap[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of Array.from(handlers)) {
        try {
          handler(...args);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  public static generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `BURR-${code}`;
  }

  // --- 1. CREA STANZA (HOST) ---
  public async createRoom(
    roomCode: string,
    hostName: string,
    playerCount: number
  ): Promise<string> {
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myName = hostName.trim() || "Host";
    this.myPlayerIdx = 0;

    this.config = {
      playerCount,
      playerNames: [this.myName],
      roundNumber: 1,
      teamPoints: [0, 0],
      targetPoints: 2000,
      isOnline: true
    };

    const hostPeerId = `${MultiplayerService.PEER_PREFIX}${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer(hostPeerId, {
        debug: 1
      });

      this.peer.on("open", (id) => {
        this.players = [
          {
            peerId: id,
            playerIdx: 0,
            name: this.myName,
            isHost: true,
            isReady: true,
            isBot: false
          }
        ];
        this.emit("connected", id);
        this.emit("roomUpdated", this.players, this.config!);
        resolve(this.roomCode);
      });

      this.peer.on("connection", (conn) => {
        this.handleIncomingHostConnection(conn);
      });

      this.peer.on("error", (err) => {
        console.error("PeerJS Host Error:", err);
        if (err.type === "unavailable-id") {
          reject(new Error("Codice stanza già occupato. Riprova con un altro codice."));
        } else {
          this.emit("error", err.message);
          reject(err);
        }
      });
    });
  }

  // Gestione connessioni in entrata per l'Host
  private handleIncomingHostConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on("data", (rawData) => {
      const data = rawData as NetworkMessage;
      this.handleHostMessage(conn, data);
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
      const departingIdx = this.players.findIndex(p => p.peerId === conn.peer);
      if (departingIdx !== -1) {
        const departedName = this.players[departingIdx].name;
        // Trasforma in bot se la partita è già iniziata o rimuovi se in lobby
        this.players[departingIdx].isBot = true;
        this.players[departingIdx].name = `${departedName} (Bot)`;
        this.broadcast({
          type: "ROOM_UPDATE",
          config: this.config!,
          players: this.players
        });
        this.emit("roomUpdated", this.players, this.config!);
      }
    });
  }

  private handleHostMessage(conn: DataConnection, msg: NetworkMessage) {
    switch (msg.type) {
      case "JOIN_REQUEST": {
        const currentCount = this.players.length;
        if (!this.config || currentCount >= this.config.playerCount) {
          conn.send({ type: "ERROR", message: "La stanza è già al completo!" });
          conn.close();
          return;
        }

        const newPlayerIdx = currentCount;
        const newPlayer: NetworkPlayer = {
          peerId: conn.peer,
          playerIdx: newPlayerIdx,
          name: msg.name.trim() || `Giocatore ${newPlayerIdx + 1}`,
          isHost: false,
          isReady: true,
          isBot: false
        };

        this.players.push(newPlayer);
        this.config.playerNames = this.players.map(p => p.name);

        // Invia conferma al nuovo giocatore
        conn.send({
          type: "JOIN_ACCEPTED",
          playerIdx: newPlayerIdx,
          config: this.config,
          players: this.players
        });

        // Notifica tutti i giocatori dell'elenco aggiornato
        this.broadcast({
          type: "ROOM_UPDATE",
          config: this.config,
          players: this.players
        });

        this.emit("roomUpdated", this.players, this.config);
        break;
      }

      case "PLAYER_ACTION": {
        // L'host riceve l'azione del client, la notifica localmente
        this.emit("actionReceived", msg.action);
        break;
      }

      case "CHAT": {
        this.broadcast(msg);
        this.emit("chatMessage", msg.message);
        break;
      }

      case "EMOJI": {
        this.broadcast(msg);
        this.emit("emojiReaction", msg.reaction);
        break;
      }
    }
  }

  // --- 2. UNISCITI A STANZA (GUEST) ---
  public async joinRoom(
    roomCode: string,
    playerName: string
  ): Promise<void> {
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myName = playerName.trim() || "Ospite";

    const hostPeerId = `${MultiplayerService.PEER_PREFIX}${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new Peer({ debug: 1 });

      this.peer.on("open", () => {
        const conn = this.peer!.connect(hostPeerId, {
          reliable: true
        });

        this.hostConnection = conn;

        conn.on("open", () => {
          conn.send({
            type: "JOIN_REQUEST",
            name: this.myName
          });
        });

        conn.on("data", (rawData) => {
          const msg = rawData as NetworkMessage;
          this.handleGuestMessage(msg);
          if (msg.type === "JOIN_ACCEPTED") {
            resolve();
          }
        });

        conn.on("error", (err) => {
          console.error("Guest Connection Error:", err);
          this.emit("error", "Impossibile connettersi alla stanza.");
          reject(err);
        });

        conn.on("close", () => {
          this.emit("disconnected");
        });
      });

      this.peer.on("error", (err) => {
        console.error("PeerJS Guest Peer Error:", err);
        if (err.type === "peer-unavailable") {
          reject(new Error("Stanza non trovata. Verifica il codice e assicurati che l'Host sia online."));
        } else {
          this.emit("error", err.message);
          reject(err);
        }
      });
    });
  }

  private handleGuestMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case "JOIN_ACCEPTED": {
        this.myPlayerIdx = msg.playerIdx;
        this.config = msg.config;
        this.players = msg.players;
        this.emit("roomUpdated", this.players, this.config);
        break;
      }

      case "ROOM_UPDATE": {
        this.config = msg.config;
        this.players = msg.players;
        this.emit("roomUpdated", this.players, this.config);
        break;
      }

      case "GAME_START": {
        this.config = msg.config;
        this.emit("gameStarted", msg.state, this.myPlayerIdx);
        break;
      }

      case "STATE_SYNC": {
        this.emit("stateSynced", msg.state);
        break;
      }

      case "CHAT": {
        this.emit("chatMessage", msg.message);
        break;
      }

      case "EMOJI": {
        this.emit("emojiReaction", msg.reaction);
        break;
      }

      case "ERROR": {
        this.emit("error", msg.message);
        break;
      }
    }
  }

  // --- 3. METODI CONDIVISI E INVIO AZIONI ---

  // L'Host riempie gli slot vuoti con bot
  public fillEmptySlotsWithBots(): void {
    if (!this.isHost || !this.config) return;
    const targetCount = this.config.playerCount;
    while (this.players.length < targetCount) {
      const botIdx = this.players.length;
      this.players.push({
        peerId: `bot_${botIdx}`,
        playerIdx: botIdx,
        name: `Bot ${botIdx + 1}`,
        isHost: false,
        isReady: true,
        isBot: true
      });
    }
    this.config.playerNames = this.players.map(p => p.name);
    this.broadcast({
      type: "ROOM_UPDATE",
      config: this.config,
      players: this.players
    });
    this.emit("roomUpdated", this.players, this.config);
  }

  // L'Host avvia la partita
  public startGame(initialState: GameState): void {
    if (!this.isHost || !this.config) return;
    this.broadcast({
      type: "GAME_START",
      state: initialState,
      config: this.config
    });
    this.emit("gameStarted", initialState, 0);
  }

  // L'Host sincronizza lo stato aggiornato a tutti i client
  public syncState(state: GameState): void {
    if (!this.isHost) return;
    this.broadcast({
      type: "STATE_SYNC",
      state
    });
  }

  // Un giocatore invia un'azione (pesca, cala, scarta)
  public sendAction(action: NetworkAction): void {
    if (this.isHost) {
      this.emit("actionReceived", action);
    } else if (this.hostConnection) {
      this.hostConnection.send({
        type: "PLAYER_ACTION",
        action
      });
    }
  }

  // Invia messaggio di chat
  public sendChat(text: string): void {
    const message: ChatMessage = {
      id: `chat_${Date.now()}_${Math.random()}`,
      senderIdx: this.myPlayerIdx,
      senderName: this.myName,
      text: text.trim(),
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.broadcast({ type: "CHAT", message });
      this.emit("chatMessage", message);
    } else if (this.hostConnection) {
      this.hostConnection.send({ type: "CHAT", message });
    }
  }

  // Invia reazione emoji
  public sendEmoji(emoji: string): void {
    const reaction: EmojiReaction = {
      playerIdx: this.myPlayerIdx,
      emoji
    };

    if (this.isHost) {
      this.broadcast({ type: "EMOJI", reaction });
      this.emit("emojiReaction", reaction);
    } else if (this.hostConnection) {
      this.hostConnection.send({ type: "EMOJI", reaction });
    }
  }

  // Broadcast dell'Host a tutti i peer connessi
  private broadcast(msg: NetworkMessage) {
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }

  // Disconnessione
  public disconnect() {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.hostConnection?.close();
    this.hostConnection = null;
    this.peer?.destroy();
    this.peer = null;
    this.players = [];
  }
}
