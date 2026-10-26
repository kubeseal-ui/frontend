// The rail is mostly a state indicator, so both halves of a stop have to move on the workflow rather
// than on the pointer: the connector is wiped in and the mark's ring and fill travel together. The
// classes are the whole contract — a segment that swapped `bg-border-strong` for `bg-accent` would
// read as a new colour arriving rather than as progress advancing along the rail. The exception is
// the stop the parent marks `back`: that one is a control, and it has to be dressed as one.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressRail from '@/components/ProgressRail.vue'

const STEPS: { key: string; label: string; back?: boolean }[] = [
  { key: 'compose', label: 'Compose', back: true },
  { key: 'review', label: 'Review' },
]

function rail(active: number, steps = STEPS) {
  return mount(ProgressRail, { props: { steps, active } })
}

describe('the workflow rail', () => {
  it('wipes the connector in rather than swapping its colour', () => {
    const first = rail(0)
    const connector = first.find('.rail-bar')
    expect(connector.exists()).toBe(true)
    // Behind the operator is the only filled state; ahead of them the track is bare.
    expect(connector.classes()).not.toContain('done')
    // Both marks carry the transition class, because they are the same element in two states.
    expect(first.findAll('.rail-mark')).toHaveLength(2)

    expect(rail(1).find('.rail-bar').classes()).toContain('done')
    expect(rail(2).find('.rail-bar').classes()).toContain('done')
  })

  it('leaves the connector’s fill to the stylesheet rather than to a utility', () => {
    // The accent belongs to the pseudo-element the wipe clips. A `bg-accent` on the connector
    // itself would win by layer order and leave a solid block with nothing to wipe.
    const connector = rail(2).find('.rail-bar')
    expect(connector.classes()).not.toContain('bg-accent')
    expect(connector.classes()).not.toContain('bg-border-strong')
  })

  it('dresses the one pressable stop as the app’s way back', () => {
    // The home base is a control until the parent stops marking it, and it wears the same accent
    // the create form's own Edit does rather than the muted treatment of a stop behind the operator.
    expect(rail(1).find('button').classes()).toContain('text-accent')

    // A done stop with no way back is history, so it stays muted label-text and never becomes a
    // button: the rail is state, and only the stop the parent marks is a control.
    const spent = rail(1, [{ key: 'edit', label: 'Edit' }, { key: 'review', label: 'Review' }])
    expect(spent.find('button').exists()).toBe(false)
    expect(spent.find('span.text-muted').exists()).toBe(true)
  })
})
