// Seedable deterministic RNG (mulberry32). Determinism is a core engine
// guarantee: seed + choice history = perfect replay (save games, analysis).
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    int(max) { return Math.floor(next() * max); }, // 0..max-1
    pick(arr) { return arr[this.int(arr.length)]; },
    shuffle(arr) { // in-place Fisher-Yates
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}
