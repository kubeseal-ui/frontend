import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SecretSearch from '@/components/SecretSearch.vue'

let platformDescriptor: PropertyDescriptor | undefined

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: platform })
}

function mountSearch() {
  return mount(SecretSearch, {
    props: { modelValue: '' },
    global: { plugins: [createPinia()] },
  })
}

beforeEach(() => {
  platformDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform')
  setActivePinia(createPinia())
})

afterEach(() => {
  if (platformDescriptor) Object.defineProperty(navigator, 'platform', platformDescriptor)
  else Reflect.deleteProperty(navigator, 'platform')
})

describe('secret search shortcut label', () => {
  it('shows Command+K on Apple platforms', () => {
    setPlatform('MacIntel')
    const wrapper = mountSearch()

    expect(wrapper.find('kbd').text()).toBe('⌘ K')
    wrapper.unmount()
  })

  it('shows Ctrl+K on other platforms', () => {
    setPlatform('Win32')
    const wrapper = mountSearch()

    expect(wrapper.find('kbd').text()).toBe('Ctrl+K')
    wrapper.unmount()
  })
})
