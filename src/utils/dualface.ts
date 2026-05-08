// Scryfall returns dual-face cards with name "Front // Back".
// The front face name is in card_faces[0].name and is what users typically write.
export function getFrontFaceName(scryfallName: string): string {
  return scryfallName.split(" // ")[0].trim();
}

export function isDualFace(cardFaces: unknown): boolean {
  return Array.isArray(cardFaces) && cardFaces.length >= 2;
}
