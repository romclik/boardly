// Site themes replace the purple everywhere (buttons, selected states, sliders...).
export const SITE_THEMES = [
  { id: 'purple', name: 'Purple', main: '#5c14ee', hi: '#8a5cff', sel: '#3c2279', deep: '#261b47' },
  { id: 'blue',   name: 'Blue',   main: '#1f6bff', hi: '#6ea0ff', sel: '#1d3a78', deep: '#14284d' },
  { id: 'teal',   name: 'Teal',   main: '#0b8f82', hi: '#3fd6c6', sel: '#14504b', deep: '#0f3633' },
  { id: 'green',  name: 'Green',  main: '#1c9a47', hi: '#4fd47c', sel: '#1d5a33', deep: '#15361f' },
  { id: 'orange', name: 'Orange', main: '#e2540b', hi: '#ff9a5c', sel: '#7a3a14', deep: '#3d2314' },
  { id: 'rose',   name: 'Rose',   main: '#e0357a', hi: '#ff7aa8', sel: '#7a1f45', deep: '#3d1527' },
  { id: 'crimson', name: 'Crimson', main: '#d12b2b', hi: '#ff7a70', sel: '#6e1d1d', deep: '#391414' },
  { id: 'graphite', name: 'Graphite', main: '#5b6475', hi: '#a9b3c6', sel: '#383e4b', deep: '#262a33' },
];

// Light squares first, dark squares second.
export const BOARD_THEMES = [
  { id: 'violet',   name: 'Violet',   l: '#cfd9ff', d: '#5a4ab8' },
  { id: 'lilac',    name: 'Lilac',    l: '#f0e6ff', d: '#9b72e6' },
  { id: 'midnight', name: 'Midnight', l: '#c4c9e6', d: '#2f3560' },
  { id: 'slate',    name: 'Slate',    l: '#d9deea', d: '#5f6c8c' },
  { id: 'ocean',    name: 'Ocean',    l: '#dbe9f4', d: '#4b7ba3' },
  { id: 'mint',     name: 'Mint',     l: '#e0f5ec', d: '#4fa384' },
  { id: 'forest',   name: 'Forest',   l: '#eeeed2', d: '#769656' },
  { id: 'wood',     name: 'Wood',     l: '#f0d9b5', d: '#b58863' },
  { id: 'sand',     name: 'Sand',     l: '#f4ead2', d: '#b59a63' },
  { id: 'coral',    name: 'Coral',    l: '#ffe6df', d: '#d9715d' },
  { id: 'rose',     name: 'Rose',     l: '#fbe3ea', d: '#c4627f' },
  { id: 'mono',     name: 'Mono',     l: '#e8e8ea', d: '#7d7d86' },
];

export function applyThemes({ accent, board }) {
  const root = document.documentElement;
  const s = SITE_THEMES.find((t) => t.id === accent) || SITE_THEMES[0];
  const b = BOARD_THEMES.find((t) => t.id === board) || BOARD_THEMES[0];
  root.style.setProperty('--purple', s.main);
  root.style.setProperty('--purple-hi', s.hi);
  root.style.setProperty('--purple-sel', s.sel);
  root.style.setProperty('--purple-deep', s.deep);
  root.style.setProperty('--lt', b.l);
  root.style.setProperty('--dk', b.d);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', '#1d1d20');
}
