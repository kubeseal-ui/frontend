import { nextTick } from 'vue'

/** A fold that takes its own button away leaves focus on `<body>`; called after the DOM settles and only when focus was actually lost. */
export async function refocusAfterCollapse(target: () => HTMLElement | null | undefined): Promise<void> {
  await nextTick()
  const active = document.activeElement
  if (active && active !== document.body) return
  target()?.focus()
}
