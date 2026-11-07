/** Drops `#trade=…` from the address bar without adding a history entry. */
export function clearTradeHash() {
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
