export type AcquisitionSource =
  | "owned"
  | "ordered"
  | "proxy"
  | "in_another_deck"
  | "need_to_buy"
  | "borrowed"
  | "in_binder"
  | "in_storage";

export const ACQUISITION_SOURCES: { value: AcquisitionSource; label: string }[] = [
  { value: "owned",           label: "Owned" },
  { value: "ordered",         label: "Ordered" },
  { value: "proxy",           label: "Proxy" },
  { value: "in_another_deck", label: "In another deck" },
  { value: "need_to_buy",     label: "Need to buy" },
  { value: "borrowed",        label: "Borrowed" },
  { value: "in_binder",       label: "In binder" },
  { value: "in_storage",      label: "In storage" },
];

export interface Card {
  id: string;
  name: string;
  inputName?: string;
  quantity: number;
  acquired: boolean;
  color: string[];
  type: string;
  source?: AcquisitionSource;
  set?: string;
  rarity?: "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";
}

export interface Deck {
  id: string;
  name: string;
  url?: string;
  cards: Card[];
  createdAt: number;
}

export interface ErrorQueueItem {
  originalName: string;
  searchName: string;
  resolved: boolean;
}