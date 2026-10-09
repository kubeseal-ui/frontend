import { nextTick } from 'vue'

/**
 * A region that folds up under the user takes the button they pressed down with it, and the
 * browser then leaves focus on `<body>` — a keyboard user's next Tab starts at the top of the
 * page. Called after the DOM has settled, and only when focus was actually lost, so it never
 * pulls focus off a control the user is still standing on.
 */
export async function refocusAfterCollapse(target: () => HTMLElement | null | undefined): Promise<void> {
  await nextTick()
  const active = document.activeElement
  if (active && active !== document.body) return
  target()?.focus()
}
