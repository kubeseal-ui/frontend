// Naive UI theme overrides.
//
// These values mirror the semantic tokens in src/style.css. They are restated
// here rather than read from the stylesheet because Naive UI resolves its own
// --n-* variables from this object and cannot resolve our CSS custom
// properties. style.css stays the source of truth: change a palette value
// there and mirror it here.
//
// Surface colours are written as 8-digit hex (#rrggbbaa) rather than
// color-mix(). This is the one place a value is handed to a third party that
// interpolates it into its own generated CSS, and an unsupported value there
// drops the background entirely instead of degrading, so the translucency uses
// the older, more widely supported syntax.

import type { GlobalThemeOverrides } from 'naive-ui'

export type ThemeMode = 'light' | 'dark'

interface Palette {
  bg: string
  surface: string
  surfaceRaised: string
  ink: string
  muted: string
  border: string
  borderStrong: string
  accent: string
  danger: string
  success: string
  warning: string
  info: string
  focus: string
}

const light: Palette = {
  bg: '#eef1f7',
  surface: '#ffffff',
  surfaceRaised: '#f6f8fc',
  ink: '#1c1c1e',
  muted: '#5b6472',
  border: '#d7dce6',
  borderStrong: '#b6bfd0',
  accent: '#2f5fd0',
  danger: '#c0221a',
  success: '#0b6b3a',
  warning: '#8a5300',
  info: '#1f5fbf',
  focus: '#1d4ed8',
}

const dark: Palette = {
  bg: '#0d1017',
  surface: '#161a24',
  surfaceRaised: '#1e2430',
  ink: '#f2f5fb',
  muted: '#a8b2c6',
  border: '#2c3446',
  borderStrong: '#414c63',
  accent: '#9db9ff',
  danger: '#ff9e95',
  success: '#79dfae',
  warning: '#f0b95f',
  info: '#86b4ff',
  focus: '#8fb0ff',
}

const fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, ui-sans-serif, system-ui, sans-serif'

export function buildThemeOverrides(mode: ThemeMode): GlobalThemeOverrides {
  const p = mode === 'dark' ? dark : light
  return {
    common: {
      bodyColor: p.bg,
      cardColor: `${p.surface}b8`,
      modalColor: p.surface,
      popoverColor: p.surface,
      inputColor: p.surfaceRaised,
      borderColor: p.border,
      dividerColor: p.border,
      textColorBase: p.ink,
      textColor1: p.ink,
      textColor2: p.ink,
      textColor3: p.muted,
      placeholderColor: p.muted,
      primaryColor: p.accent,
      primaryColorHover: p.accent,
      primaryColorPressed: p.accent,
      primaryColorSuppl: p.accent,
      infoColor: p.info,
      successColor: p.success,
      warningColor: p.warning,
      errorColor: p.danger,
      borderRadius: '16px',
      borderRadiusSmall: '10px',
      fontFamily,
      fontFamilyMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    },
    Card: {
      color: `${p.surface}b8`,
      borderColor: `${p.borderStrong}73`,
      borderRadius: '20px',
      titleTextColor: p.ink,
      textColor: p.muted,
    },
    Input: {
      color: `${p.surfaceRaised}f2`,
      border: `1px solid ${p.borderStrong}80`,
      borderRadius: '12px',
      textColor: p.ink,
      placeholderColor: p.muted,
    },
    Alert: {
      borderRadius: '16px',
    },
    Tag: {
      borderRadius: '999px',
    },
  }
}
