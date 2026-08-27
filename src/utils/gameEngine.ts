import { type Card, createDeck, shuffleDeck } from '../types/card';
import { isValidMeld } from './rules';

export interface Meld {
  id: string;
  type: 'group' | 'run';
  clean: boolean;
  key: string; // seme per scala, valore per gruppo
  cards: Card[];
}

export interface Team {
  id: number; // 0: Squadra 1, 1: Squadra 2, etc.
  name?: string;
  points: number;
  hasTakenPozzetto: boolean;
  melds: Meld[];
  playerIndices: number[];
}

export interface GameConfig {
  playerCount: number; // 2 | 3 | 4 | 5 | 6
  playerNames: string[];
  roundNumber?: number;
  teamPoints?: number[];
  targetPoints?: number;
  isOnline?: boolean;
}

export interface GameState {
  config: GameConfig;
  deck: Card[];
  discardPile: Card[];
  hands: Card[][]; // 1 mano per ogni giocatore (da 2 a 6)
  pozzetti: Card[][];
  teams: Team[];
  playerTeamMap: number[]; // playerIdx -> teamId
  currentPlayerIdx: number;
  turnPhase: 'draw' | 'play';
  roundOver: boolean;
  roundNumber: number;
  history: string[];
}

export function getDefaultConfig(playerCount = 4, customNames?: string[]): GameConfig {
  const defaultNames = ["Tu", "Bot 2", "Bot 3", "Bot 4", "Bot 5", "Bot 6"];
  const names = customNames && customNames.length >= playerCount
    ? customNames
    : defaultNames.slice(0, playerCount);

  return {
    playerCount,
    playerNames: names,
    roundNumber: 1,
    teamPoints: [0, 0],
    targetPoints: 2000,
    isOnline: false
  };
}

export function createInitialState(configOrRound?: GameConfig | number, legacyPoints?: number[]): GameState {
  let config: GameConfig;
  if (typeof configOrRound === 'number' || !configOrRound) {
    const round = typeof configOrRound === 'number' ? configOrRound : 1;
    config = getDefaultConfig(4);
    config.roundNumber = round;
    if (legacyPoints) config.teamPoints = legacyPoints;
  } else {
    config = configOrRound;
  }

  const playerCount = config.playerCount || 4;
  const numDecks = playerCount >= 5 ? 3 : 2; // 3 mazzi (162 carte) per 5 o 6 giocatori, 2 mazzi (108 carte) per 2-4
  let deck = shuffleDeck(createDeck(numDecks));
  
  // Distribuzione mani (11 carte ciascuno)
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < 11; i++) {
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(deck.pop()!);
    }
  }
  
  // Pozzetti in base al numero di giocatori
  // 2 o 4 giocatori: 2 pozzetti da 11 carte
  // 3 giocatori: 1 da 18 carte (singolo) e 1 da 11 carte (coppia)
  // 5 giocatori: 1 da 18 carte e 1 da 11 carte (con 3 mazzi)
  // 6 giocatori: 2 pozzetti da 18 carte (con 3 mazzi per squadre da 3)
  const pozzetti: Card[][] = [];
  if (playerCount === 3 || playerCount === 5) {
    const p18: Card[] = [];
    for (let i = 0; i < 18; i++) p18.push(deck.pop()!);
    const p11: Card[] = [];
    for (let i = 0; i < 11; i++) p11.push(deck.pop()!);
    pozzetti.push(p18, p11);
  } else if (playerCount === 6) {
    const p1: Card[] = [];
    const p2: Card[] = [];
    for (let i = 0; i < 18; i++) {
      p1.push(deck.pop()!);
      p2.push(deck.pop()!);
    }
    pozzetti.push(p1, p2);
  } else {
    // 2 o 4 giocatori
    const p1: Card[] = [];
    const p2: Card[] = [];
    for (let i = 0; i < 11; i++) {
      p1.push(deck.pop()!);
      p2.push(deck.pop()!);
    }
    pozzetti.push(p1, p2);
  }
  
  // Primo scarto
  const discardPile: Card[] = [deck.pop()!];

  // Configurazione Squadre
  let teams: Team[] = [];
  let playerTeamMap: number[] = [];

  if (playerCount === 2) {
    teams = [
      { id: 0, name: config.playerNames[0] || "Giocatore 1", points: config.teamPoints?.[0] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [0] },
      { id: 1, name: config.playerNames[1] || "Giocatore 2", points: config.teamPoints?.[1] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [1] }
    ];
    playerTeamMap = [0, 1];
  } else if (playerCount === 3) {
    teams = [
      { id: 0, name: "Singolo", points: config.teamPoints?.[0] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [0] },
      { id: 1, name: "Coppia", points: config.teamPoints?.[1] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [1, 2] }
    ];
    playerTeamMap = [0, 1, 1];
  } else if (playerCount === 6) {
    // 2 squadre da 3 giocatori seduti alternati: S1 = [0, 2, 4], S2 = [1, 3, 5]
    teams = [
      { id: 0, name: "Squadra 1", points: config.teamPoints?.[0] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [0, 2, 4] },
      { id: 1, name: "Squadra 2", points: config.teamPoints?.[1] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [1, 3, 5] }
    ];
    playerTeamMap = [0, 1, 0, 1, 0, 1];
  } else if (playerCount === 5) {
    teams = [
      { id: 0, name: "Squadra 1 (3G)", points: config.teamPoints?.[0] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [0, 2, 4] },
      { id: 1, name: "Squadra 2 (2G)", points: config.teamPoints?.[1] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [1, 3] }
    ];
    playerTeamMap = [0, 1, 0, 1, 0];
  } else {
    // 4 giocatori standard: S1 = [0, 2], S2 = [1, 3]
    teams = [
      { id: 0, name: "Squadra 1", points: config.teamPoints?.[0] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [0, 2] },
      { id: 1, name: "Squadra 2", points: config.teamPoints?.[1] || 0, hasTakenPozzetto: false, melds: [], playerIndices: [1, 3] }
    ];
    playerTeamMap = [0, 1, 0, 1];
  }
  
  return {
    config,
    deck,
    discardPile,
    hands,
    pozzetti,
    teams,
    playerTeamMap,
    currentPlayerIdx: 0,
    turnPhase: 'draw',
    roundOver: false,
    roundNumber: config.roundNumber || 1,
    history: [`Partita iniziata! Turno iniziale di ${config.playerNames?.[0] || "Giocatore 1"}.`]
  };
}

export function getEnginePlayerName(state: GameState, playerIdx: number): string {
  if (state.config?.playerNames && state.config.playerNames[playerIdx]) {
    return state.config.playerNames[playerIdx];
  }
  return playerIdx === 0 ? "Giocatore 1" : `Giocatore ${playerIdx + 1}`;
}

export function getPlayerTeamId(stateOrPlayerIdx: GameState | number, playerIdxParam?: number): number {
  if (typeof stateOrPlayerIdx === 'number') {
    return stateOrPlayerIdx % 2 === 0 ? 0 : 1;
  }
  const playerIdx = playerIdxParam !== undefined ? playerIdxParam : stateOrPlayerIdx.currentPlayerIdx;
  return stateOrPlayerIdx.playerTeamMap[playerIdx] ?? (playerIdx % 2 === 0 ? 0 : 1);
}

export function getPlayerDisplayName(state: GameState, playerIdx: number, myPlayerIdx = 0): string {
  if (playerIdx === myPlayerIdx) return "Tu";
  if (state.config.playerNames && state.config.playerNames[playerIdx]) {
    return state.config.playerNames[playerIdx];
  }
  return `G.${playerIdx + 1}`;
}

export function drawFromDeck(state: GameState, playerIdx: number): GameState {
  if (state.turnPhase !== 'draw' || state.currentPlayerIdx !== playerIdx || state.roundOver) {
    return state;
  }
  
  const newState = { ...state };
  newState.deck = [...state.deck];
  newState.hands = state.hands.map(h => [...h]);
  newState.history = [...state.history];
  
  // Se il mazzo è quasi vuoto, ricostruisci lasciando l'ultima
  if (newState.deck.length === 0) {
    newState.history.push("Il mazzo è esaurito. Il round termina in pareggio!");
    newState.roundOver = true;
    return newState;
  }
  
  const card = newState.deck.pop()!;
  newState.hands[playerIdx].push(card);
  newState.turnPhase = 'play';
  
  const pName = getEnginePlayerName(state, playerIdx);
  newState.history.push(`${pName} ha pescato dal mazzo.`);
  
  return newState;
}

export function takeDiscardPile(state: GameState, playerIdx: number): GameState {
  if (state.turnPhase !== 'draw' || state.currentPlayerIdx !== playerIdx || state.roundOver) {
    return state;
  }
  
  const newState = { ...state };
  newState.discardPile = [];
  newState.hands = state.hands.map(h => [...h]);
  newState.history = [...state.history];
  
  const taken = state.discardPile;
  newState.hands[playerIdx].push(...taken);
  newState.turnPhase = 'play';
  
  const pName = getEnginePlayerName(state, playerIdx);
  newState.history.push(`${pName} ha raccolto gli scarti (${taken.length} carte).`);
  
  return newState;
}

// Verifica se la mossa rispetta la regola di non-svuotamento mano
function checkMeldConstraints(handLen: number, meldLen: number, hasTakenPozzetto: boolean): boolean {
  // Se abbiamo già preso il pozzetto, non possiamo svuotare la mano senza scarto
  if (hasTakenPozzetto && handLen - meldLen === 0) {
    return false;
  }
  return true;
}

export function meldNewCombination(
  state: GameState,
  playerIdx: number,
  cardsToMeld: Card[]
): { state: GameState; success: boolean; msg: string } {
  if (state.turnPhase !== 'play' || state.currentPlayerIdx !== playerIdx || state.roundOver) {
    return { state, success: false, msg: "Non è il tuo turno o non sei in fase di gioco." };
  }
  
  const teamId = getPlayerTeamId(playerIdx);
  const team = state.teams[teamId];
  
  if (!checkMeldConstraints(state.hands[playerIdx].length, cardsToMeld.length, team.hasTakenPozzetto)) {
    return { state, success: false, msg: "Avendo già preso il pozzetto, devi conservare almeno una carta da scartare a fine turno." };
  }
  
  const validation = isValidMeld(cardsToMeld);
  if (!validation.valid) {
    return { state, success: false, msg: "La combinazione non è valida secondo le regole del Burraco." };
  }
  
  const newState = { ...state };
  newState.hands = state.hands.map(h => [...h]);
  newState.teams = state.teams.map(t => ({
    ...t,
    melds: t.melds.map(m => ({ ...m, cards: [...m.cards] }))
  }));
  newState.history = [...state.history];
  
  // Rimuovi carte dalla mano
  const cardIds = new Set(cardsToMeld.map(c => c.id));
  newState.hands[playerIdx] = newState.hands[playerIdx].filter(c => !cardIds.has(c.id));
  
  // Aggiungi nuova calata
  const newMeld: Meld = {
    id: `meld_${Date.now()}_${Math.random()}`,
    type: validation.type!,
    clean: validation.clean,
    key: validation.key!,
    cards: validation.ordered
  };
  newState.teams[teamId].melds.push(newMeld);
  
  const pName = getEnginePlayerName(state, playerIdx);
  newState.history.push(`${pName} ha calato una nuova combinazione: ${cardsToMeld.map(c => c.rank + (c.suit || '')).join(' ')}`);
  
  // Gestione pozzetto al volo
  return {
    state: checkAndTakePozzetto(newState, playerIdx),
    success: true,
    msg: "Combinazione calata con successo!"
  };
}

export function addToExistingMeld(
  state: GameState,
  playerIdx: number,
  meldIdx: number,
  cardsToAdd: Card[]
): { state: GameState; success: boolean; msg: string } {
  if (state.turnPhase !== 'play' || state.currentPlayerIdx !== playerIdx || state.roundOver) {
    return { state, success: false, msg: "Non è il tuo turno o non sei in fase di gioco." };
  }
  
  const teamId = getPlayerTeamId(playerIdx);
  const team = state.teams[teamId];
  const meld = team.melds[meldIdx];
  
  if (!meld) {
    return { state, success: false, msg: "Calata non trovata." };
  }
  
  if (!checkMeldConstraints(state.hands[playerIdx].length, cardsToAdd.length, team.hasTakenPozzetto)) {
    return { state, success: false, msg: "Avendo già preso il pozzetto, devi conservare almeno una carta da scartare." };
  }
  
  // Tenta l'unione
  const mergedCards = [...meld.cards, ...cardsToAdd];
  const validation = isValidMeld(mergedCards);
  if (!validation.valid || validation.type !== meld.type) {
    return { state, success: false, msg: "L'aggiunta non produce una combinazione valida o altera il tipo di calata." };
  }
  
  const newState = { ...state };
  newState.hands = state.hands.map(h => [...h]);
  newState.teams = state.teams.map(t => ({
    ...t,
    melds: t.melds.map(m => ({ ...m, cards: [...m.cards] }))
  }));
  newState.history = [...state.history];
  
  // Rimuovi carte dalla mano
  const cardIds = new Set(cardsToAdd.map(c => c.id));
  newState.hands[playerIdx] = newState.hands[playerIdx].filter(c => !cardIds.has(c.id));
  
  // Aggiorna calata esistente
  newState.teams[teamId].melds[meldIdx] = {
    ...meld,
    clean: validation.clean,
    cards: validation.ordered
  };
  
  const pName = getEnginePlayerName(state, playerIdx);
  newState.history.push(`${pName} ha aggiunto ${cardsToAdd.map(c => c.rank + (c.suit || '')).join(' ')} ad una calata esistente.`);
  
  // Gestione pozzetto al volo
  return {
    state: checkAndTakePozzetto(newState, playerIdx),
    success: true,
    msg: "Carte aggiunte con successo!"
  };
}

export function discardCard(
  state: GameState,
  playerIdx: number,
  cardToDiscard: Card,
  isClosingConfirm = false
): { state: GameState; success: boolean; msg: string } {
  if (state.turnPhase !== 'play' || state.currentPlayerIdx !== playerIdx || state.roundOver) {
    return { state, success: false, msg: "Azione non consentita." };
  }
  
  const teamId = getPlayerTeamId(playerIdx);
  const team = state.teams[teamId];
  const hand = state.hands[playerIdx];
  
  // Verifica se tenta la chiusura
  const isClosing = hand.length === 1 && hand[0].id === cardToDiscard.id;
  
  if (isClosing) {
    if (!team.hasTakenPozzetto) {
      // Chiusura per prendere il pozzetto con lo scarto
      const newState = { ...state };
      newState.hands = state.hands.map(h => [...h]);
      newState.discardPile = [...state.discardPile, cardToDiscard];
      newState.hands[playerIdx] = [];
      newState.history = [...state.history];
      
      const pName = getEnginePlayerName(state, playerIdx);
      newState.history.push(`${pName} scarta ${cardToDiscard.rank}${cardToDiscard.suit || ''} per prendere il pozzetto.`);
      
      const stateWithPozzetto = checkAndTakePozzetto(newState, playerIdx);
      
      // Il turno passa al giocatore successivo poiché ha scartato
      return {
        state: nextTurn(stateWithPozzetto),
        success: true,
        msg: "Pozzetto preso con lo scarto. Turno passato."
      };
    } else {
      // Chiusura definitiva del round
      const hasBurraco = team.melds.some(m => m.cards.length >= 7);
      if (!hasBurraco) {
        return { state, success: false, msg: "Non puoi chiudere il round senza aver realizzato almeno un Burraco (combinazione di 7 o più carte)." };
      }
      
      if (cardToDiscard.isWildcard) {
        return { state, success: false, msg: "Non puoi chiudere scartando una matta (2 o Jolly)." };
      }
      
      if (playerIdx === 0 && !isClosingConfirm) {
        return { state, success: false, msg: "CONFIRM_REQUIRED" };
      }
      
      // Chiusura valida!
      const newState = { ...state };
      newState.hands = state.hands.map(h => [...h]);
      newState.discardPile = [...state.discardPile, cardToDiscard];
      newState.hands[playerIdx] = [];
      newState.roundOver = true;
      newState.history = [...state.history];
      
      const pName = getEnginePlayerName(state, playerIdx);
      newState.history.push(`${pName} ha CHIUSO il round scartando ${cardToDiscard.rank}${cardToDiscard.suit || ''}!`);
      
      return {
        state: newState,
        success: true,
        msg: "Chiusura del round effettuata!"
      };
    }
  }
  
  // Scarto normale
  const newState = { ...state };
  newState.hands = state.hands.map(h => [...h]);
  newState.discardPile = [...state.discardPile, cardToDiscard];
  newState.hands[playerIdx] = newState.hands[playerIdx].filter(c => c.id !== cardToDiscard.id);
  newState.history = [...state.history];
  
  const pName = getEnginePlayerName(state, playerIdx);
  newState.history.push(`${pName} ha scartato ${cardToDiscard.rank}${cardToDiscard.suit || ''}.`);
  
  return {
    state: nextTurn(newState),
    success: true,
    msg: "Scarto completato."
  };
}

function checkAndTakePozzetto(state: GameState, playerIdx: number): GameState {
  const teamId = getPlayerTeamId(playerIdx);
  const team = state.teams[teamId];
  const hand = state.hands[playerIdx];
  
  if (hand.length === 0 && !team.hasTakenPozzetto) {
    const newState = { ...state };
    newState.teams = state.teams.map((t, idx) => idx === teamId ? { ...t, hasTakenPozzetto: true } : t);
    newState.pozzetti = [...state.pozzetti];
    newState.hands = state.hands.map(h => [...h]);
    newState.history = [...state.history];
    
    // Prendi il primo pozzetto disponibile
    const pozzetto = newState.pozzetti.shift();
    if (pozzetto) {
      newState.hands[playerIdx] = pozzetto;
      const pName = getEnginePlayerName(state, playerIdx);
      newState.history.push(`★ ${pName} ha preso il pozzetto! ★`);
    }
    return newState;
  }
  return state;
}

function nextTurn(state: GameState): GameState {
  const newState = { ...state };
  
  if (newState.deck.length === 0) {
    newState.roundOver = true;
    newState.history.push("Il mazzo è esaurito. Round terminato.");
    return newState;
  }
  
  const playerCount = state.config.playerCount || 4;
  newState.currentPlayerIdx = (state.currentPlayerIdx + 1) % playerCount;
  newState.turnPhase = 'draw';
  
  return newState;
}

export interface ScoreDetails {
  teamName: string;
  meldedCardsValue: number;
  burracoBonus: number;
  closingBonus: number;
  pozzettoPenalty: number;
  handPenalty: number;
  total: number;
}

export function calculateRoundScores(state: GameState): { scores: number[]; details: ScoreDetails[] } {
  const numTeams = state.teams.length;
  const details: ScoreDetails[] = [];
  const scores: number[] = [];
  
  for (let tId = 0; tId < numTeams; tId++) {
    const team = state.teams[tId];
    const playerIndices = team.playerIndices && team.playerIndices.length > 0
      ? team.playerIndices
      : state.playerTeamMap
          .map((teamIndex, pIdx) => teamIndex === tId ? pIdx : -1)
          .filter(pIdx => pIdx !== -1);
    
    // 1. Somma valori carte calate
    let meldedCardsValue = 0;
    let burracoBonus = 0;
    
    for (const meld of team.melds) {
      meldedCardsValue += meld.cards.reduce((sum, c) => sum + c.value, 0);
      if (meld.cards.length >= 7) {
        burracoBonus += meld.clean ? 200 : 100;
      }
    }
    
    // 2. Bonus chiusura
    let closingBonus = 0;
    const closed = state.roundOver && playerIndices.some(p => state.hands[p] && state.hands[p].length === 0);
    if (closed) {
      closingBonus = 100;
    }
    
    // 3. Penale pozzetto
    let pozzettoPenalty = 0;
    if (!team.hasTakenPozzetto) {
      pozzettoPenalty = -100;
    }
    
    // 4. Penale carte in mano
    let handPenalty = 0;
    for (const p of playerIndices) {
      if (state.hands[p]) {
        handPenalty -= state.hands[p].reduce((sum, c) => sum + c.value, 0);
      }
    }
    
    const total = meldedCardsValue + burracoBonus + closingBonus + pozzettoPenalty + handPenalty;
    
    details.push({
      teamName: team.name || `Squadra ${tId + 1}`,
      meldedCardsValue,
      burracoBonus,
      closingBonus,
      pozzettoPenalty,
      handPenalty,
      total
    });
    scores.push(total);
  }
  
  return {
    scores,
    details
  };
}
