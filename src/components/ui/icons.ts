// Path data only, on a 24x24 grid in currentColor, so AppIcon is a single v-for over
// `path` elements — no v-html, identical in a browser and happy-dom. `as const` makes
// IconName a union of the keys, so a misspelled `:name` is a build error.
export const ICONS = {
  namespace: ['M12 3l9 4.5-9 4.5-9-4.5z', 'M3 7.5v9L12 21v-9', 'M21 7.5v9L12 21'],
  lock: [
    'M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z',
    'M8 10V7a4 4 0 0 1 8 0v3',
  ],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 4v5h-5'],
  'sign-out': ['M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', 'M10 17l5-5-5-5', 'M15 12H3'],
  'chevron-left': ['M14.5 5 7.5 12l7 7'],
  'chevron-down': ['M6.5 9.5 12 15l5.5-5.5'],
  // The mapped Git file: the Sync control's glyph, because it writes the cluster's copy to it.
  file: ['M13.5 3.2H7a2 2 0 0 0-2 2v13.6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.7l-5.5-5.5Z', 'M13.4 3.4v5.3h5.3'],
  copy: [
    'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z',
    'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  pencil: ['M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5 13.5-13.5Z'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  alert: ['M12 3.5 2.5 20h19L12 3.5Z', 'M12 10v4.5', 'M12 17v.5'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 11v5.5', 'M12 7.5v.5'],
  x: ['m6 6 12 12', 'M18 6 6 18'],
  // Two paths rather than the four that add the lid's ridges: at 14px they read as noise.
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  ],
  database: [
    'M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Z',
    'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'm16.2 16.2 4.3 4.3'],
  // A block of text rather than a paragraph mark: at 13px a pilcrow's bowl fills in, and the
  // uneven rules are what make it read as many lines instead of a list.
  lines: ['M3.5 6.5h17', 'M3.5 12h11', 'M3.5 17.5h14'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  'eye-off': [
    'M2.5 12S6 5.5 12 5.5a10 10 0 0 1 4.3 1',
    'M21.5 12S18 18.5 12 18.5a10 10 0 0 1-4.3-1',
    'm4 4 16 16',
  ],
  // The display is the one state with no conventional glyph, so its word must survive as
  // a label.
  sun: [
    'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
    'M12 2.5v2',
    'M12 19.5v2',
    'M2.5 12h2',
    'M19.5 12h2',
    'm5.3 5.3 1.4 1.4',
    'm17.3 17.3 1.4 1.4',
    'm17.3 5.3 1.4-1.4',
    'm5.3 18.7 1.4-1.4',
  ],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  monitor: [
    'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M12 18v3',
    'M8 21h8',
  ],
} as const

export type IconName = keyof typeof ICONS
