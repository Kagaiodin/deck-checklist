/** The page itself, as an object so tests can stub `reload` (jsdom can't navigate). */
export const page = {
  reload: () => window.location.reload(),
};
