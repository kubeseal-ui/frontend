/**
 * The displacement map behind the Liquid Glass lens.
 *
 * `feDisplacementMap` shifts each pixel of the backdrop by
 * `scale * (channel - 0.5)`, reading the amount of shift out of a map image:
 * red drives x, green drives y, and either channel at 128 means "do not move".
 * The whole difference between a lens and a smear is *where* the map is not
 * neutral — a uniform map displaces every pixel equally and reads as a blur,
 * while a map that is neutral in the middle and pushed outward in a band near
 * the edge bends the backdrop only where a real lens would.
 *
 * So this is a bevelled rounded rectangle drawn as four gradient bands over a
 * neutral field: left and right drive red, top and bottom drive green, each
 * ramping from neutral at the inner edge of the band to fully displaced at the
 * rim. The filter that consumes it blurs the result before displacing, which
 * turns those hard band boundaries into the smooth ramp a bevel needs.
 *
 * It is an SVG data URI rather than a PNG so the profile is reviewable as
 * source instead of as an opaque binary, and so there is no asset to ship or
 * build step to add. `preserveAspectRatio` is left to the filter, which
 * stretches the map to whatever shape it is applied to.
 */
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
