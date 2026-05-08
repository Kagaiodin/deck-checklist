export interface Card {
  id: string;
  name: string;
  inputName?: string;
  quantity: number;
  acquired: boolean;
  color: string[];
  type: string;
}

export interface Deck {
  id: string;
  name: string;
  cards: Card[];
  createdAt: number;
}

export interface ErrorQueueItem {
  originalName: string;
  searchName: string;
  resolved: boolean;
}