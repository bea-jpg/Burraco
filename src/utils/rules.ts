import type { Card, Rank, Suit } from '../types/card';

export function getRankForPos(p: number): Rank {
  if (p === 1 || p === 14) return 'A';
  if (p === 2) return '2';
  if (p >= 3 && p <= 10) return String(p) as Rank;
  if (p === 11) return 'J';
  if (p === 12) return 'Q';
  if (p === 13) return 'K';
  return 'Joker';
}

export function isValidGroup(cards: Card[]): { valid: boolean; clean: boolean } {
  if (cards.length < 3) return { valid: false, clean: false };

  const jokers = cards.filter(c => c.isJoker);
  const pinelle = cards.filter(c => c.rank === '2');
  
  if (jokers.length > 1) return { valid: false, clean: false };
  
  const naturals = cards.filter(c => !c.isWildcard);
  
  if (naturals.length === 0) {
    if (pinelle.length >= 2 && jokers.length <= 1) {
      return { valid: true, clean: jokers.length === 0 };
    }
    return { valid: false, clean: false };
  }

  const rank = naturals[0].rank;
  if (naturals.some(c => c.rank !== rank)) {
    return { valid: false, clean: false };
  }
  
  const wildcardsCount = jokers.length + pinelle.length;
  if (wildcardsCount > 1) {
    return { valid: false, clean: false };
  }
  
  return { valid: true, clean: wildcardsCount === 0 };
}

export function isValidRun(cards: Card[]): { valid: boolean; clean: boolean; suit: Suit | null; ordered: Card[] } {
  if (cards.length < 3) return { valid: false, clean: false, suit: null, ordered: [] };

  const nonWildcards = cards.filter(c => c.rank !== '2' && !c.isJoker);
  if (nonWildcards.length === 0) {
    return { valid: false, clean: false, suit: null, ordered: [] };
  }
  
  const suit = nonWildcards[0].suit;
  if (nonWildcards.some(c => c.suit !== suit)) {
    return { valid: false, clean: false, suit: null, ordered: [] };
  }

  const mandatoryWildcards = cards.filter(c => c.isJoker || (c.rank === '2' && c.suit !== suit));
  if (mandatoryWildcards.length > 1) {
    return { valid: false, clean: false, suit: null, ordered: [] };
  }

  const L = cards.length;
  if (L > 14) {
    return { valid: false, clean: false, suit: null, ordered: [] };
  }

  for (let start = 1; start <= 15 - L; start++) {
    const end = start + L - 1;
    const targets: { [key: number]: Rank } = {};
    for (let p = start; p <= end; p++) {
      targets[p] = getRankForPos(p);
    }
    
    const assigned: { [key: number]: Card } = {};
    
    function backtrack(cardIdx: number, wildcardUsed: boolean): boolean {
      if (cardIdx === cards.length) {
        return true;
      }
      
      const card = cards[cardIdx];
      
      for (let p = start; p <= end; p++) {
        if (assigned[p] !== undefined) continue;
        
        // 1. Prova come naturale
        if (card.suit === suit && card.rank === targets[p]) {
          if (card.rank === '2' && p !== 2) {
            // Un 2 del seme è naturale solo alla pos p=2
          } else {
            assigned[p] = card;
            if (backtrack(cardIdx + 1, wildcardUsed)) return true;
            delete assigned[p];
          }
        }
        
        // 2. Prova come matta
        if (card.isWildcard && !wildcardUsed) {
          if (card.rank === '2' && card.suit === suit && p === 2) {
            // Un 2 del seme in pos 2 è naturale, non matta
          } else {
            assigned[p] = card;
            if (backtrack(cardIdx + 1, true)) return true;
            delete assigned[p];
          }
        }
      }
      return false;
    }
    
    if (backtrack(0, false)) {
      const sortedKeys = Object.keys(assigned).map(Number).sort((a, b) => a - b);
      const ordered = sortedKeys.map(k => assigned[k]);
      
      let hasWildcard = false;
      for (const p of sortedKeys) {
        const card = assigned[p];
        if (card.isJoker) {
          hasWildcard = true;
        } else if (card.rank === '2') {
          if (card.suit !== suit || p !== 2) {
            hasWildcard = true;
          }
        }
      }
      
      return { valid: true, clean: !hasWildcard, suit, ordered };
    }
  }

  return { valid: false, clean: false, suit: null, ordered: [] };
}

export type MeldType = 'group' | 'run';

export interface ValidMeldResult {
  valid: boolean;
  type: MeldType | null;
  clean: boolean;
  key: string | null;
  ordered: Card[];
}

export function isValidMeld(cards: Card[]): ValidMeldResult {
  const runRes = isValidRun(cards);
  if (runRes.valid) {
    return {
      valid: true,
      type: 'run',
      clean: runRes.clean,
      key: runRes.suit,
      ordered: runRes.ordered
    };
  }

  const grpRes = isValidGroup(cards);
  if (grpRes.valid) {
    const naturals = cards.filter(c => !c.isWildcard);
    const key = naturals.length > 0 ? naturals[0].rank : '2';
    return {
      valid: true,
      type: 'group',
      clean: grpRes.clean,
      key,
      ordered: cards
    };
  }

  return {
    valid: false,
    type: null,
    clean: false,
    key: null,
    ordered: []
  };
}

export function calculateMeldPoints(cards: Card[], isClean: boolean): number {
  let points = cards.reduce((sum, c) => sum + c.value, 0);
  if (cards.length >= 7) {
    points += isClean ? 200 : 100;
  }
  return points;
}

export function calculateHandPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.value, 0);
}
