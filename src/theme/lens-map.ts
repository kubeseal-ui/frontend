// The displacement map behind the Liquid Glass lens. `feDisplacementMap` shifts each pixel
// by `scale * (channel - 0.5)` — red drives x, green drives y, 128 means "do not move" —
// so the map is a bevelled rounded rectangle: four gradient bands over a neutral field,
// ramping to fully displaced at the rim. A uniform map would displace every pixel equally
// and read as a blur. An SVG data URI rather than a PNG, so the profile is reviewable as
// source.
const MAP = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="lens-left" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgb(0,128,128)"/>
      <stop offset="1" stop-color="rgb(128,128,128)"/>
    </linearGradient>
    <linearGradient id="lens-right" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgb(128,128,128)"/>
      <stop offset="1" stop-color="rgb(255,128,128)"/>
    </linearGradient>
    <linearGradient id="lens-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(128,0,128)"/>
      <stop offset="1" stop-color="rgb(128,128,128)"/>
    </linearGradient>
    <linearGradient id="lens-bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(128,128,128)"/>
      <stop offset="1" stop-color="rgb(128,255,128)"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="rgb(128,128,128)"/>
  <rect width="32" height="200" fill="url(#lens-left)"/>
  <rect x="168" width="32" height="200" fill="url(#lens-right)"/>
  <rect width="200" height="32" fill="url(#lens-top)"/>
  <rect y="168" width="200" height="32" fill="url(#lens-bottom)"/>
</svg>`

export const LENS_MAP = `data:image/svg+xml,${encodeURIComponent(MAP)}`
