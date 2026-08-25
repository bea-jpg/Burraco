import { type GameState, getPlayerTeamId, meldNewCombination, addToExistingMeld } from './gameEngine';
import type { Card } from '../types/card';
import { isValidMeld, isValidRun } from './rules';

export function chooseDrawAction(state: GameState, botIdx: number): 'deck' | 'discard' {
  const pile = state.discardPile;
  if (pile.length === 0) return 'deck';

  const hand = state.hands[botIdx];
  const teamId = getPlayerTeamId(botIdx);
  const team = state.teams[teamId];

  // 1. Raccoglie se c'è una matta negli scarti
  if (pile.some(c => c.isWildcard)) {
    return 'discard';
  }

  // 2. Raccoglie se può aggiungere una delle carte scartate alle calate esistenti
  for (const card of pile) {
    for (let mIdx = 0; mIdx < team.melds.length; mIdx++) {
      const meld = team.melds[mIdx];
      const combined = [...meld.cards, card];
      const check = isValidMeld(combined);
      if (check.valid && check.type === meld.type) {
        return 'discard';
      }
    }
  }

  // 3. Raccoglie se la carta in cima si combina bene con la mano
  const topCard = pile[pile.length - 1];
  const sameRank = hand.filter(c => c.rank === topCard.rank);
  if (sameRank.length >= 2) {
    return 'discard';
  }

  if (topCard.suit) {
    const sameSuit = hand.filter(c => c.suit === topCard.suit);
    if (sameSuit.length >= 2) {
      return 'discard';
    }
  }

  // 4. Se ci sono tante carte scartate conviene accumularle
  if (pile.length >= 4) {
    return 'discard';
  }

  return 'deck';
}

// Genera combinazioni matematiche di K elementi da un array
function getCombinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

export function playBotMelds(state: GameState, botIdx: number): GameState {
  let currentState = { ...state };
  let madeMove = true;
  
  const teamId = getPlayerTeamId(botIdx);
  
  // Esegue le calate a ciclo continuo finché è possibile fare mosse valide
  let loopCount = 0;
  while (madeMove && loopCount < 10) {
    madeMove = false;
    loopCount++;
    
    const hand = currentState.hands[botIdx];
    const team = currentState.teams[teamId];
    
    // --- 1. PROVA AD AGGIUNGERE ALLE CALATE ESISTENTI ---
    for (let mIdx = 0; mIdx < team.melds.length; mIdx++) {
      for (const card of hand) {
        // Vincolo mano pozzetto
        if (hand.length === 1 && team.hasTakenPozzetto) {
          continue;
        }
        
        const res = addToExistingMeld(currentState, botIdx, mIdx, [card]);
        if (res.success) {
          currentState = res.state;
          madeMove = true;
          break;
        }
      }
      if (madeMove) break;
    }
    
    if (madeMove) continue;

    // --- 2. PROVA A CREARE NUOVI GRUPPI DI 3+ CARTE ---
    const ranksInHand: { [key: string]: Card[] } = {};
    for (const card of hand) {
      if (!card.isWildcard && card.rank !== 'Joker') {
        if (!ranksInHand[card.rank]) ranksInHand[card.rank] = [];
        ranksInHand[card.rank].push(card);
      }
    }
    
    const wildcards = hand.filter(c => c.isWildcard);

    for (const rank of Object.keys(ranksInHand)) {
      const cards = ranksInHand[rank];
      
      // Gruppo pulito da 3
      if (cards.length >= 3) {
        if (hand.length === 3 && team.hasTakenPozzetto) {
          continue;
        }
        const res = meldNewCombination(currentState, botIdx, cards.slice(0, 3));
        if (res.success) {
          currentState = res.state;
          madeMove = true;
          break;
        }
      }
      
      // Gruppo sporco da 2 + 1 matta
      if (cards.length === 2 && wildcards.length >= 1) {
        if (hand.length === 3 && team.hasTakenPozzetto) {
          continue;
        }
        const cardsToMeld = [...cards, wildcards[0]];
        const res = meldNewCombination(currentState, botIdx, cardsToMeld);
        if (res.success) {
          currentState = res.state;
          madeMove = true;
          break;
        }
      }
    }

    if (madeMove) continue;

    // --- 3. PROVA A CREARE NUOVE SCALE DI 3 CARTE ---
    const suitsInHand: { [key: string]: Card[] } = {};
    for (const card of hand) {
      if (card.suit) {
        if (!suitsInHand[card.suit]) suitsInHand[card.suit] = [];
        suitsInHand[card.suit].push(card);
      }
    }

    for (const suit of Object.keys(suitsInHand)) {
      const cards = suitsInHand[suit];
      
      // Combinazioni pulite di 3 dello stesso seme
      if (cards.length >= 3) {
        const combos = getCombinations(cards, 3);
        for (const combo of combos) {
          const check = isValidRun(combo);
          if (check.valid) {
            if (hand.length === 3 && team.hasTakenPozzetto) {
              continue;
            }
            const res = meldNewCombination(currentState, botIdx, combo);
            if (res.success) {
              currentState = res.state;
              madeMove = true;
              break;
            }
          }
        }
        if (madeMove) break;
      }

      // Combinazioni sporche di 2 + 1 matta
      if (cards.length >= 2 && wildcards.length >= 1) {
        const combos2 = getCombinations(cards, 2);
        for (const combo2 of combos2) {
          for (const wc of wildcards) {
            if (!combo2.some(c => c.id === wc.id)) {
              const testRun = [...combo2, wc];
              const check = isValidRun(testRun);
              if (check.valid) {
                if (hand.length === 3 && team.hasTakenPozzetto) {
                  continue;
                }
                const res = meldNewCombination(currentState, botIdx, testRun);
                if (res.success) {
                  currentState = res.state;
                  madeMove = true;
                  break;
                }
              }
            }
          }
          if (madeMove) break;
        }
        if (madeMove) break;
      }
    }
  }
  
  return currentState;
}

export function playSingleBotMeld(
  state: GameState, 
  botIdx: number
): { state: GameState; played: boolean; changedMeldIdx: number | null } {
  const currentState = { ...state };
  const teamId = getPlayerTeamId(botIdx);
  const hand = currentState.hands[botIdx];
  const team = currentState.teams[teamId];
  
  // --- 1. PROVA AD AGGIUNGERE ALLE CALATE ESISTENTI ---
  for (let mIdx = 0; mIdx < team.melds.length; mIdx++) {
    for (const card of hand) {
      if (hand.length === 1 && team.hasTakenPozzetto) {
        continue;
      }
      
      const res = addToExistingMeld(currentState, botIdx, mIdx, [card]);
      if (res.success) {
        return { state: res.state, played: true, changedMeldIdx: mIdx };
      }
    }
  }
  
  // --- 2. PROVA A CREARE NUOVI GRUPPI DI 3+ CARTE ---
  const ranksInHand: { [key: string]: Card[] } = {};
  for (const card of hand) {
    if (!card.isWildcard && card.rank !== 'Joker') {
      if (!ranksInHand[card.rank]) ranksInHand[card.rank] = [];
      ranksInHand[card.rank].push(card);
    }
  }
  const wildcards = hand.filter(c => c.isWildcard);

  for (const rank of Object.keys(ranksInHand)) {
    const cards = ranksInHand[rank];
    
    if (cards.length >= 3) {
      if (hand.length === 3 && team.hasTakenPozzetto) {
        continue;
      }
      const res = meldNewCombination(currentState, botIdx, cards.slice(0, 3));
      if (res.success) {
        return { state: res.state, played: true, changedMeldIdx: res.state.teams[teamId].melds.length - 1 };
      }
    }
    
    if (cards.length === 2 && wildcards.length >= 1) {
      if (hand.length === 3 && team.hasTakenPozzetto) {
        continue;
      }
      const cardsToMeld = [...cards, wildcards[0]];
      const res = meldNewCombination(currentState, botIdx, cardsToMeld);
      if (res.success) {
        return { state: res.state, played: true, changedMeldIdx: res.state.teams[teamId].melds.length - 1 };
      }
    }
  }

  // --- 3. PROVA A CREARE NUOVE SCALE DI 3 CARTE ---
  const suitsInHand: { [key: string]: Card[] } = {};
  for (const card of hand) {
    if (card.suit) {
      if (!suitsInHand[card.suit]) suitsInHand[card.suit] = [];
      suitsInHand[card.suit].push(card);
    }
  }

  for (const suit of Object.keys(suitsInHand)) {
    const cards = suitsInHand[suit];
    
    if (cards.length >= 3) {
      const combos = getCombinations(cards, 3);
      for (const combo of combos) {
        const check = isValidRun(combo);
        if (check.valid) {
          if (hand.length === 3 && team.hasTakenPozzetto) {
            continue;
          }
          const res = meldNewCombination(currentState, botIdx, combo);
          if (res.success) {
            return { state: res.state, played: true, changedMeldIdx: res.state.teams[teamId].melds.length - 1 };
          }
        }
      }
    }

    if (cards.length >= 2 && wildcards.length >= 1) {
      const combos2 = getCombinations(cards, 2);
      for (const combo2 of combos2) {
        for (const wc of wildcards) {
          if (!combo2.some(c => c.id === wc.id)) {
            const testRun = [...combo2, wc];
            const check = isValidRun(testRun);
            if (check.valid) {
              if (hand.length === 3 && team.hasTakenPozzetto) {
                continue;
              }
              const res = meldNewCombination(currentState, botIdx, testRun);
              if (res.success) {
                return { state: res.state, played: true, changedMeldIdx: res.state.teams[teamId].melds.length - 1 };
              }
            }
          }
        }
      }
    }
  }

  return { state, played: false, changedMeldIdx: null };
}

export function chooseBotDiscard(state: GameState, botIdx: number): { card: Card; isClosing: boolean } {
  const hand = state.hands[botIdx];
  const teamId = getPlayerTeamId(botIdx);
  const team = state.teams[teamId];

  // Caso chiusura a 1 carta
  if (hand.length === 1) {
    const card = hand[0];
    const hasBurraco = team.melds.some(m => m.cards.length >= 7);
    const isClosing = team.hasTakenPozzetto && hasBurraco && !card.isWildcard;
    return { card, isClosing };
  }

  // Scarto normale: sceglie la carta meno connessa
  const nonWildcards = hand.filter(c => !c.isWildcard);
  if (nonWildcards.length > 0) {
    let worstCard = nonWildcards[0];
    let minScore = 999;
    
    for (const card of nonWildcards) {
      let score = 0;
      for (const other of hand) {
        if (other.id !== card.id) {
          if (other.suit === card.suit) score += 1;
          if (other.rank === card.rank) score += 2;
        }
      }
      if (score < minScore) {
        minScore = score;
        worstCard = card;
      }
    }
    return { card: worstCard, isClosing: false };
  }

  // Se ha solo matte, scarta una qualsiasi
  return { card: hand[0], isClosing: false };
}
