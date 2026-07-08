// Card database wrapper around data/cards.json content.
export function createDb(cardsJson) {
  const byCode = cardsJson.cards;
  const byTitle = {};
  for (const c of Object.values(byCode)) {
    byTitle[c.strippedTitle.toLowerCase()] = c;
    byTitle[c.title.toLowerCase()] = c;
  }
  return {
    meta: cardsJson.meta,
    byCode,
    card(code) {
      const c = byCode[code];
      if (!c) throw new Error(`unknown card code ${code}`);
      return c;
    },
    titled(title) {
      const c = byTitle[title.toLowerCase()];
      if (!c) throw new Error(`unknown card title ${title}`);
      return c;
    },
  };
}
