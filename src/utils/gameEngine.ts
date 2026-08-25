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
  id: number; // 0: Squadra 1 (Giocatore 1 e 3), 1: Squadra 2 (Giocatore 2 e 4)
  points: number;
  hasTakenPozzetto: boolean;
  melds: Meld[];
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  hands: Card[][]; // [Umano, Bot2, Bot3, Bot4]
  pozzetti: Card[][]; // 2 pozzetti
  teams: Team[];
  currentPlayerIdx: number;
  turnPhase: 'draw' | 'play';
  roundOver: boolean;
  roundNumber: number;
  history: string[];
}

export function createInitialState(roundNumber = 1, teamPoints = [0, 0]): GameState {
  let deck = shuffleDeck(createDeck());
  
  // Distribuzione mani (11 carte ciascuno)
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < 11; i++) {
    for (let p = 0; p < 4; p++) {
      hands[p].push(deck.pop()!);
    }
  }
  
  // Pozzetti (11 carte ciascuno)
  const pozzetti: Card[][] = [[], []];
  for (let i = 0; i < 11; i++) {
    pozzetti[0].push(deck.pop()!);
    pozzetti[1].push(deck.pop()!);
  }
  
  // Primo scarto
  const discardPile: Card[] = [deck.pop()!];
  
  return {
    deck,
    discardPile,
    hands,
    pozzetti,
    teams: [
      { id: 0, points: teamPoints[0], hasTakenPozzetto: false, melds: [] },
      { id: 1, points: teamPoints[1], hasTakenPozzetto: false, melds: [] }
    ],
    currentPlayerIdx: 0,
    turnPhase: 'draw',
    roundOver: false,
    roundNumber,
    history: ["Partita iniziata! Pesca dal mazzo o raccogli gli scarti."]
  };
}

export function getPlayerTeamId(playerIdx: number): number {
  return playerIdx % 2 === 0 ? 0 : 1;
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
  
  const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
  
  const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
  
  const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
  
  const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
      
      const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
      
      const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
  
  const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
      const pName = playerIdx === 0 ? "Tu" : `Bot ${playerIdx + 1}`;
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
  
  newState.currentPlayerIdx = (state.currentPlayerIdx + 1) % 4;
  newState.turnPhase = 'draw';
  
  return newState;
}

export interface ScoreDetails {
  meldedCardsValue: number;
  burracoBonus: number;
  closingBonus: number;
  pozzettoPenalty: number;
  handPenalty: number;
  total: number;
}

export function calculateRoundScores(state: GameState): { scores: number[]; details: ScoreDetails[] } {
  const details: ScoreDetails[] = [
    { meldedCardsValue: 0, burracoBonus: 0, closingBonus: 0, pozzettoPenalty: 0, handPenalty: 0, total: 0 },
    { meldedCardsValue: 0, burracoBonus: 0, closingBonus: 0, pozzettoPenalty: 0, handPenalty: 0, total: 0 }
  ];
  
  for (let tId = 0; tId < 2; tId++) {
    const team = state.teams[tId];
    
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
    const players = tId === 0 ? [0, 2] : [1, 3];
    const closed = state.roundOver && players.some(p => state.hands[p].length === 0);
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
    for (const p of players) {
      handPenalty -= state.hands[p].reduce((sum, c) => sum + c.value, 0);
    }
    
    const total = meldedCardsValue + burracoBonus + closingBonus + pozzettoPenalty + handPenalty;
    
    details[tId] = {
      meldedCardsValue,
      burracoBonus,
      closingBonus,
      pozzettoPenalty,
      handPenalty,
      total
    };
  }
  
  return {
    scores: [details[0].total, details[1].total],
    details
  };
}
