export type Suit = '♥' | '♦' | '♣' | '♠';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker';

export interface Card {
  id: string;
  suit: Suit | null;
  rank: Rank;
  isJoker: boolean;
  isWildcard: boolean;
  value: number;
}

export function getCardValue(rank: Rank): number {
  if (rank === 'Joker') return 30;
  if (rank === '2') return 20;
  if (rank === 'A') return 15;
  if (['8', '9', '10', 'J', 'Q', 'K'].includes(rank)) return 10;
  return 5;
}

export function createCard(id: string, suit: Suit | null, rank: Rank): Card {
  const isJoker = rank === 'Joker';
  const isWildcard = isJoker || rank === '2';
  return {
    id,
    suit,
    rank,
    isJoker,
    isWildcard,
    value: getCardValue(rank)
  };
}

export function createDeck(): Card[] {
  const suits: Suit[] = ['♥', '♦', '♣', '♠'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];
  let idCounter = 0;
  
  for (let m = 0; m < 2; m++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push(createCard(`c_${idCounter++}`, suit, rank));
      }
    }
    deck.push(createCard(`c_${idCounter++}`, null, 'Joker'));
    deck.push(createCard(`c_${idCounter++}`, null, 'Joker'));
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}
