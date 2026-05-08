import { useState } from "react";
import type { Card, Deck } from "../types/index";

interface Props {
  deck: Deck;
  onToggleAcquired: (cardId: string) => void;
}

type GroupBy = "none" | "color" | "type";

const COLOR_LABELS: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green"
};

function colorLabel(colors: string[]): string {
  if (colors.length === 0) return "Colorless";
  if (colors.length > 1) return "Multicolor";
  return COLOR_LABELS[colors[0]] ?? colors[0];
}

function groupCards(cards: Card[], groupBy: GroupBy): [string, Card[]][] {
  if (groupBy === "none") return [["All Cards", cards]];

  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const key = groupBy === "color" ? colorLabel(card.color) : card.type;
    const bucket = map.get(key) ?? [];
    bucket.push(card);
    map.set(key, bucket);
  }

  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function Checklist({ deck, onToggleAcquired }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const visibleCards = showMissingOnly
    ? deck.cards.filter(c => !c.acquired)
    : deck.cards;

  const groups = groupCards(visibleCards, groupBy);

  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
  const totalItems = deck.cards.length;
  const acquiredCards = deck.cards.filter(c => c.acquired).reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="checklist">
      <div className="checklist-header">
        <div className="checklist-stats">
          <span>
            {acquiredCards} / {totalCards} cards acquired
            <span className="stats-items-note"> · {totalItems} items</span>
          </span>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: totalCards > 0 ? `${(acquiredCards / totalCards) * 100}%` : "0%" }}
            />
          </div>
        </div>

        <div className="checklist-controls">
          <label className="control-label">
            Group by:
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
              className="control-select"
            >
              <option value="none">None</option>
              <option value="color">Color</option>
              <option value="type">Type</option>
            </select>
          </label>

          <label className="control-label toggle-label">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={e => setShowMissingOnly(e.target.checked)}
            />
            Missing only
          </label>
        </div>
      </div>

      {groups.map(([groupName, cards]) => (
        <div key={groupName} className="card-group">
          {groupBy !== "none" && (
            <h3 className="group-title">
              {groupName} <span className="group-count">({cards.length})</span>
            </h3>
          )}
          <ul className="card-list">
            {cards.map(card => (
              <li
                key={card.id}
                className={`card-row${card.acquired ? " acquired" : ""}`}
                onClick={() => onToggleAcquired(card.id)}
              >
                <input
                  type="checkbox"
                  checked={card.acquired}
                  onChange={() => onToggleAcquired(card.id)}
                  onClick={e => e.stopPropagation()}
                  className="card-checkbox"
                />
                <span className="card-qty">{card.quantity}x</span>
                <span className="card-name">
                  <span className="card-name-primary">{card.name}</span>
                  {card.inputName && <span className="card-input-name">{card.inputName}</span>}
                </span>
                <span className="card-type">{card.type}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {visibleCards.length === 0 && (
        <p className="empty-state">
          {showMissingOnly ? "All cards acquired!" : "No cards in this deck."}
        </p>
      )}
    </div>
  );
}
