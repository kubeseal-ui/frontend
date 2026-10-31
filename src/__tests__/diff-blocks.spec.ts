import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffBlocks from '@/components/DiffBlocks.vue'

describe('paired document diffs', () => {
  it('collapses long unchanged sections while keeping context and changes visible', () => {
    const before = [...Array.from({ length: 9 }, (_, i) => `before-${i + 1}`), 'old-value', ...Array.from({ length: 9 }, (_, i) => `after-${i + 1}`)].join('\n')
    const after = before.replace('old-value', 'new-value')
    const wrapper = mount(DiffBlocks, { props: { before, after } })

    expect(wrapper.text()).toContain('before-1')
    expect(wrapper.text()).toContain('before-2')
    expect(wrapper.text()).toContain('old-value')
    expect(wrapper.text()).toContain('new-value')
    expect(wrapper.text()).toContain('after-8')
    expect(wrapper.text()).not.toContain('before-3')
    expect(wrapper.text()).toContain('Show 5 unchanged lines')
  })

  it('expands and collapses both panes together', async () => {
    const before = [...'abcdefghi', 'old-value', ...'jklmnopqr'].join('\n')
    const after = before.replace('old-value', 'new-value')
    const wrapper = mount(DiffBlocks, { props: { before, after } })
    const visibleLineCount = (line: string) => wrapper.findAll('div').filter((element) => element.text() === line).length

    await wrapper.get('button[aria-expanded="false"]').trigger('click')
    expect(wrapper.text()).toContain('Show 5 unchanged lines')
    expect(visibleLineCount('c')).toBe(2)
    expect(wrapper.text()).toContain('Hide 5 unchanged lines')
    expect(wrapper.findAll('button[aria-expanded="true"]')).toHaveLength(1)

    await wrapper.get('button[aria-expanded="true"]').trigger('click')
    expect(wrapper.text()).not.toContain('Hide 5 unchanged lines')
    expect(wrapper.text()).toContain('Show 5 unchanged lines')
    expect(visibleLineCount('c')).toBe(0)
  })

  it('keeps short unchanged documents fully visible', () => {
    const before = ['kind: SealedSecret', 'name: api', 'value: old'].join('\n')
    const after = before.replace('old', 'new')
    const wrapper = mount(DiffBlocks, { props: { before, after } })

    expect(wrapper.text()).toContain('name: api')
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
