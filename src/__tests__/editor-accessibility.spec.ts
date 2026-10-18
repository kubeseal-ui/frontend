// The editor's keyboard and announcement behaviour: where focus lands when a control opens a
// row, when a row is allowed to say it is wrong, and what an operator without reveal access or
// without a clean Git source can still do.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { pinia } from '@/pinia'
import { api } from '@/api'
import DocumentEditor from '@/components/DocumentEditor.vue'
import KeyRows from '@/components/KeyRows.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Capability, GitState, Mutation, SealedSecretDetail } from '@/types'

const ALL: Capability[] = ['metadata:read', 'secret:seal', 'secret:decrypt']

function git(overrides: Partial<GitState> = {}): GitState {
  return {
    managed: true, in_sync_with_live: true, drift: 'in-sync',
    base_commit: 'abc123', file_path: 'clusters/payments/api.yaml', branch: 'main', delivery_mode: 'direct',
    ...overrides,
  }
}

function detail(overrides: Partial<SealedSecretDetail> = {}): SealedSecretDetail {
  return {
    name: 'api', namespace: 'payments', key_count: 2, keys: ['password', 'api_key'], scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    sealed_secret_yaml: 'apiVersion: bitnami.com/v1alpha1\nkind: SealedSecret\n',
    git: git(),
    ...overrides,
  }
}

function grant(grants: Capability[]) {
  useAuthStore(pinia).setSession({ email: 'operator@example.com', name: 'Operator', username: 'operator', namespaces: { payments: grants } })
}

function mountRows(grants: Capability[] = ALL, overrides: Partial<SealedSecretDetail> = {}) {
  grant(grants)
  return mount(KeyRows, { props: { detail: detail(overrides) }, attachTo: document.body, global: { plugins: [pinia] } })
}

const button = (wrapper: ReturnType<typeof mountRows>, label: string) =>
  wrapper.findAll('button').find((candidate) => candidate.attributes('aria-label') === label || candidate.text() === label)

// Every reveal control reads the same, so they are matched by order: the row is what tells them
// apart, and which row a press discloses is the thing under test.
const revealButtons = (wrapper: ReturnType<typeof mountRows>) =>
  wrapper.findAll('button').filter((candidate) => candidate.attributes('aria-label')?.startsWith('Reveal ') === true)

// The last batch the editor mirrored up to the surface, which is what the first press would send.
// `emitted()` does not know what an event carries, so the payload shape is asserted where it is read.
const batch = (wrapper: ReturnType<typeof mountRows>): Mutation[] =>
  ((wrapper.emitted() as Record<string, Mutation[][][]>)['update:batch'] ?? []).at(-1)?.[0] ?? []

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  useAuthStore(pinia).clearSession()
  document.body.innerHTML = ''
})

describe('revealing', () => {
  it('decrypts one key at a time, each as its own audited request', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { key: 'password', value: 'hunter2' } } as never)
    const wrapper = mountRows()

    await revealButtons(wrapper)[0]!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/api/v1/secrets/payments/api/reveal', { key: 'password', base_commit: 'abc123' })
    // The row holds the plaintext it asked for; every other row still holds dots.
    expect(wrapper.find('[aria-label="Revealed value for password"]').text()).toBe('hunter2')
    expect(wrapper.text()).toContain('••••••••••••')
    // No bulk control: the second key is a second press and a second disclosure.
    expect(revealButtons(wrapper)).toHaveLength(1)
  })

  it('says it is decrypting while the reveal is in flight, then wipes the value in', async () => {
    let release!: (value: unknown) => void
    const inflight = new Promise((resolve) => { release = resolve })
    vi.spyOn(api, 'post').mockReturnValue(inflight as never)
    const wrapper = mountRows()

    await revealButtons(wrapper)[0]!.trigger('click')
    await flushPromises()

    // The wait is the request, not a transition: a reveal is one decrypt and one audit event,
    // and the row says what it is waiting for instead of leaving the dots sitting there.
    expect(wrapper.text()).toContain('Decrypting')
    expect(wrapper.find('.spin').exists()).toBe(true)

    release({ data: { key: 'password', value: 'hunter2' } })
    await flushPromises()

    // The mask is wiped back rather than faded, with an accent edge crossing the slot with it.
    expect(wrapper.find('[aria-label="Revealed value for password"]').classes()).toContain('reveal-in')
    expect(wrapper.find('.sweep').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Decrypting')
  })

  it('drops the plaintext when the key is concealed again', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { key: 'password', value: 'hunter2' } } as never)
    const wrapper = mountRows()

    await revealButtons(wrapper)[0]!.trigger('click')
    await flushPromises()
    vi.useFakeTimers()
    await button(wrapper, 'Conceal password')!.trigger('click')
    // Conceal plays its exit animation before the plaintext leaves the DOM.
    await vi.advanceTimersByTimeAsync(380)
    vi.useRealTimers()

    expect(wrapper.find('[aria-label="Revealed value for password"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('hunter2')
    expect(revealButtons(wrapper)).toHaveLength(2)
  })

  it('keeps Change and Remove available while a value is revealed', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { key: 'password', value: 'hunter2' } } as never)
    const wrapper = mountRows()

    await revealButtons(wrapper)[0]!.trigger('click')
    await flushPromises()

    // Revealing a value to read it must not take away the ability to change it: Conceal joins the
    // row's controls rather than replacing them.
    expect(button(wrapper, 'Conceal password')).toBeDefined()
    expect(button(wrapper, 'Change password')).toBeDefined()
    expect(button(wrapper, 'Remove password')).toBeDefined()
  })

  it('withholds reveal without secret:decrypt, and says why, while edits stay available', async () => {
    const wrapper = mountRows(['metadata:read', 'secret:seal'])
    expect(wrapper.text()).toContain('this namespace does not grant reveal access')
    expect(revealButtons(wrapper)).toHaveLength(0)

    // Editing is a seal, not a decrypt: staging a change never reads the old value, so seal alone
    // is enough to add, replace, and remove.
    expect(button(wrapper, 'Change password')).toBeDefined()
    expect(button(wrapper, 'Remove password')).toBeDefined()
    expect(button(wrapper, 'Add a key')).toBeDefined()

    // Names are still readable — that is what metadata:read buys — and the value is still there,
    // as the dots that stand in for it.
    expect(wrapper.text()).toContain('password')
    expect(wrapper.text()).toContain('••••••••••••')
  })
})

describe('staging a change', () => {
  it('puts focus in the field the control just opened', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()

    // Change is gone the moment it is pressed, so without this the keyboard user is dumped on
    // the body and has to tab back through the inventory to reach the field they asked for.
    const active = document.activeElement as HTMLInputElement
    expect(active?.type).toBe('password')
    expect(active?.getAttribute('aria-label')).toBe('Replacement value for password')
  })

  it('stages a replacement value, and discarding the row drops it', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    expect(batch(wrapper)).toEqual([{ key: 'password', operation: 'replace', value: 'rotated' }])

    // The panel opened through the fold, so the rows below it moved down rather than jumping.
    expect(wrapper.find('.fold.open').exists()).toBe(true)

    await button(wrapper, 'Discard the staged change to password')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('#staged-password').exists()).toBe(false)
    expect(wrapper.find('.fold.open').exists()).toBe(false)
    expect(batch(wrapper)).toEqual([])
  })

  it('stages a delete and moves focus to the option it chose', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Remove password')!.trigger('click')
    await flushPromises()

    const active = document.activeElement as HTMLInputElement
    expect(active?.name).toBe('operation-password')
    expect(active?.value).toBe('delete')
    // A delete opens no value field, so nothing sits between choosing it and reviewing it.
    expect(wrapper.find('input[aria-label="Replacement value for password"]').exists()).toBe(false)
    expect(batch(wrapper)).toEqual([{ key: 'password', operation: 'delete', value: '' }])
  })

  it('reports each entry change as one batch, so they travel as one commit', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await button(wrapper, 'Remove api_key')!.trigger('click')
    await flushPromises()

    expect(batch(wrapper)).toEqual([
      { key: 'password', operation: 'replace', value: 'rotated' },
      { key: 'api_key', operation: 'delete', value: '' },
    ])
  })
})

describe('when a row is allowed to say it is wrong', () => {
  it('stays quiet until the row is left', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()

    // A field that turns red the moment it appears reads as a fault rather than a prompt.
    expect(wrapper.text()).not.toContain('This change needs a value.')

    await wrapper.find('#staged-password').trigger('focusout', { relatedTarget: null })
    expect(wrapper.text()).toContain('This change needs a value.')
    expect(wrapper.find('#staged-password input[aria-label="Replacement value for password"]').attributes('aria-describedby')).toBe('staged-problem-password')
  })

  it('says nothing when a delete needs no value', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Remove password')!.trigger('click')
    await flushPromises()
    await wrapper.find('#staged-password').trigger('focusout', { relatedTarget: null })
    expect(wrapper.text()).not.toContain('This change needs a value.')
  })

  it('marks every open row at once when a press asks what is missing', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await button(wrapper, 'Change api_key')!.trigger('click')
    await flushPromises()

    // Opening the second row moves focus out of the first, and being left is what lets a row speak —
    // so only the row just opened is still quiet, and the press is what makes the pair agree.
    const problems = () => wrapper.findAll('p').filter((node) => node.text() === 'This change needs a value.')
    expect(problems()).toHaveLength(1)

    ;(wrapper.vm as unknown as { showProblems: () => void }).showProblems()
    await flushPromises()

    expect(problems()).toHaveLength(2)
  })

  it('names what the batch is missing, in the words the press would be refused with', async () => {
    const wrapper = mountRows()
    const vm = wrapper.vm as unknown as { batchProblem: string }

    expect(vm.batchProblem).toBe('')

    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    expect(vm.batchProblem).toBe('Every key being added needs a name.')

    await wrapper.find('input[aria-label="New key name 1"]').setValue('password')
    expect(vm.batchProblem).toBe('Every key being changed needs a value.')
  })

  it('refuses deleting the only key, but allows it when the same batch adds one', async () => {
    const wrapper = mountRows(ALL, { keys: ['only'], key_count: 1 })
    const vm = wrapper.vm as unknown as { batchProblem: string }

    await button(wrapper, 'Remove only')!.trigger('click')
    await flushPromises()
    // Deleting the last key would leave the Secret with no encryptedData, which the server refuses
    // with a 400 after a decrypt — caught here so the row can say why instead.
    expect(vm.batchProblem).toBe('A Secret must keep at least one key; this change would remove the last one.')

    // A key added in the same batch keeps the Secret non-empty, so the delete is allowed — the test
    // is the net count, not the presence of a delete.
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="New key name 1"]').setValue('replacement')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('v')
    expect(vm.batchProblem).toBe('')
  })
})

describe('adding a key', () => {
  it('puts focus on the name field of the row it just added', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()

    const active = document.activeElement as HTMLInputElement
    expect(active?.getAttribute('aria-label')).toBe('New key name 1')
  })

  it('refuses a name the Secret already uses, once the row has been left', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="New key name 1"]').setValue('password')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('rotated')

    expect(wrapper.text()).not.toContain('This Secret already has a key named password.')
    await wrapper.findAll('li').at(-1)!.trigger('focusout', { relatedTarget: null })
    expect(wrapper.text()).toContain('This Secret already has a key named password.')

    // A batch that is otherwise complete is refused for the collision alone: an add over a key
    // that is present is what the API refuses, so it is not offered.
    const vm = wrapper.vm as unknown as { batchProblem: string }
    expect(vm.batchProblem).toBe('Every new key needs a name the Secret does not already use: password.')
  })

  // Kubernetes refuses data keys outside the ConfigMap-key rule, so a space in a key name is
  // caught at the row rather than surfacing as drift or a 400 after delivery.
  it('refuses a key name with a space, at the row and in the batch', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="New key name 1"]').setValue('my key')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('v')

    expect(wrapper.text()).not.toContain('Key names can use only letters, digits, dashes, underscores, and dots, and must start and end with a letter or digit.')
    await wrapper.findAll('li').at(-1)!.trigger('focusout', { relatedTarget: null })
    expect(wrapper.text()).toContain('Key names can use only letters, digits, dashes, underscores, and dots, and must start and end with a letter or digit.')

    const vm = wrapper.vm as unknown as { batchProblem: string }
    expect(vm.batchProblem).toBe('Some new key names Kubernetes refuses: my key.')
  })

  it('carries a new key as an add alongside the rest of the batch', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="New key name 1"]').setValue('database_url')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('postgres://localhost')

    expect(batch(wrapper)).toEqual([{ key: 'database_url', operation: 'add', value: 'postgres://localhost' }])
  })
})

// A staged value is the one thing on the page nothing else can be checked against: the operator
// typed it a moment ago and the row answers with dots. Peeking at it reads nothing back from the
// server, which is why this is not the row's Reveal — that is a decrypt and an audit event.
describe('the value being staged', () => {
  it("masks what was typed until the field's own control is pressed", async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()

    const field = wrapper.find('input[aria-label="Replacement value for password"]')
    expect(field.attributes('type')).toBe('password')
    const show = button(wrapper, 'Show the replacement value for password')!
    expect(show.attributes('aria-pressed')).toBe('false')

    await show.trigger('click')
    expect(field.attributes('type')).toBe('text')
    // One control both ways, so the press that revealed is the press that hides.
    await button(wrapper, 'Hide the replacement value for password')!.trigger('click')
    expect(field.attributes('type')).toBe('password')
  })

  it('gives a new key row its own, and re-masks the field when the row is discarded', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()

    const field = wrapper.find('input[aria-label="New key value 1"]')
    expect(field.attributes('type')).toBe('password')
    await button(wrapper, 'Show the new key value 1')!.trigger('click')
    expect(field.attributes('type')).toBe('text')

    // Discarded and added again, the row is a new one and comes back masked rather than holding
    // the previous row's disclosure.
    await button(wrapper, 'Remove new key 1')!.trigger('click')
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()

    expect(wrapper.find('input[aria-label="New key value 1"]').attributes('type')).toBe('password')
    expect(button(wrapper, 'Show the new key value 1')).toBeDefined()
  })

  // A private key, a kubeconfig, and a config file are staged here as often as a password is, and
  // no `<input>` can hold one: HTML strips CR and LF from both `type=password` and `type=text`, so
  // a pasted block arrives silently joined into a single line. These are the assertions that fail
  // if either field is ever narrowed back to an input.
  it('stages a multi-line value with its newlines intact', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()

    // The default is unchanged: the row opens on the native password field.
    expect(wrapper.find('input[aria-label="Replacement value for password"]').exists()).toBe(true)
    await button(wrapper, 'Use a multi-line field for password')!.trigger('click')
    await flushPromises()

    const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE KEY-----\n'
    await wrapper.find('textarea[aria-label="Replacement value for password"]').setValue(pem)

    expect(batch(wrapper)).toEqual([{ key: 'password', operation: 'replace', value: pem }])
  })

  it('carries a multi-line new key through to the batch, and forgets the shape with the row', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    await button(wrapper, 'Use a multi-line field for new key 1')!.trigger('click')
    await flushPromises()

    const cert = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'
    await wrapper.find('input[aria-label="New key name 1"]').setValue('tls.crt')
    await wrapper.find('textarea[aria-label="New key value 1"]').setValue(cert)

    expect(batch(wrapper)).toEqual([{ key: 'tls.crt', operation: 'add', value: cert }])

    // Discarded and added again, the row is a new one: the shape belongs to the row that is gone
    // rather than to the position in the list.
    await button(wrapper, 'Remove new key 1')!.trigger('click')
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()

    expect(wrapper.find('input[aria-label="New key value 1"]').exists()).toBe(true)
    expect(wrapper.find('textarea[aria-label="New key value 1"]').exists()).toBe(false)
  })

  // The opened box is masked with `-webkit-text-security`, which happy-dom reports as supported
  // unconditionally, so this branch is live here — and where a browser really lacks it the eye is
  // withheld instead, which is KeyRows' decision rather than the field's.
  it('conceals the opened box only once it holds something', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()
    await button(wrapper, 'Use a multi-line field for password')!.trigger('click')
    await flushPromises()

    const box = () => wrapper.find('textarea[aria-label="Replacement value for password"]')
    // The property stipples the placeholder too, and an empty box drawn as dots reads as one that
    // already holds a value.
    expect(box().classes()).not.toContain('conceal')

    await box().setValue('hunter2')
    expect(box().classes()).toContain('conceal')

    // The eye is what shows it, and it is still one press both ways.
    await button(wrapper, 'Show the replacement value for password')!.trigger('click')
    expect(box().classes()).not.toContain('conceal')
  })

  it('returns the row to its one-line field when the change is discarded', async () => {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()
    await button(wrapper, 'Use a multi-line field for password')!.trigger('click')
    await flushPromises()
    await button(wrapper, 'Discard the staged change to password')!.trigger('click')
    await flushPromises()

    await button(wrapper, 'Change password')!.trigger('click')
    await flushPromises()

    // Reopening is a new staging, so the row comes back with the native password field and its
    // built-in masking rather than inheriting the last one's shape.
    expect(wrapper.find('input[aria-label="Replacement value for password"]').attributes('type')).toBe('password')
    expect(wrapper.find('textarea[aria-label="Replacement value for password"]').exists()).toBe(false)
  })
})

describe('Remove', () => {
  it('carries the trash glyph and the danger tone', () => {
    const wrapper = mountRows()
    const remove = button(wrapper, 'Remove password')!

    // The one action here that pressing its own control again does not undo, so it is the one that
    // does not wear the neutral tone its neighbours use.
    expect(remove.classes()).toContain('text-danger')
    expect(remove.find('svg').exists()).toBe(true)
    // The word survives beside the glyph, so the control is never an icon-only target.
    expect(remove.text()).toBe('Remove')
  })
})

describe('when the Git source is not in sync', () => {
  it('withholds every control that would read or write a value', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} } as never)
    const wrapper = mountRows(ALL, { git: git({ in_sync_with_live: false, drift: 'unknown' }) })
    // Every control that would read or write a value is gone; the values themselves stay, as dots.
    expect(wrapper.text()).toContain('••••••••••••')

    // Reveal is withheld with the rest. The server answers a drifted reveal with 409, so offering
    // it would be a guaranteed failure and a decrypt's worth of audit trail for nothing.
    expect(revealButtons(wrapper)).toHaveLength(0)
    expect(button(wrapper, 'Change password')).toBeUndefined()
    expect(button(wrapper, 'Remove password')).toBeUndefined()
    expect(button(wrapper, 'Add a key')).toBeUndefined()
    expect(post).not.toHaveBeenCalled()

    // The names are still readable — that is what metadata:read buys, drift or not.
    expect(wrapper.text()).toContain('password')
  })
})

describe('every control', () => {
  // ADR-004's guarantee, walked over the controls the editor actually renders rather than a list
  // someone has to remember to extend. A staged row and an added row between them reach every kind
  // of control the editor has: a radio option, a masked field, its reveal toggle, and plain buttons.
  async function openEverything() {
    const wrapper = mountRows()
    await button(wrapper, 'Change password')!.trigger('click')
    await button(wrapper, 'Add a key')!.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('carries an accessible name', async () => {
    const wrapper = await openEverything()
    const controls = wrapper.findAll('button, input, textarea')
    expect(controls.length).toBeGreaterThan(8)

    const unnamed = controls.filter((control) => {
      if (control.attributes('aria-label')?.trim()) return false
      const element = control.element as HTMLElement
      if (element.textContent?.trim()) return false
      // A field wrapped in its own `<label>` is named by it, which is how the radio options are named.
      return !element.closest('label')
    })
    expect(unnamed.map((control) => control.html())).toEqual([])
  })

  it('stays at or below the default tab order', async () => {
    const wrapper = await openEverything()
    const raised = wrapper.findAll('[tabindex]').filter((node) => Number(node.attributes('tabindex')) > 0)
    expect(raised.map((node) => node.html())).toEqual([])
  })

  it('takes focus unless it is disabled', async () => {
    const wrapper = await openEverything()
    const reachable = wrapper.findAll('button, input, textarea').filter((control) => control.attributes('disabled') === undefined)
    expect(reachable.length).toBeGreaterThan(8)

    for (const control of reachable) {
      ;(control.element as HTMLElement).focus()
      expect(document.activeElement).toBe(control.element)
    }
  })
})

describe('the document view', () => {
  // Only the clipboard is replaced: monkey-patching the whole `navigator` would take `userAgent`
  // and the rest with it, and feature detection reads those during a mount.
  function stubClipboard(writeText: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  }

  it('renders the ciphertext read-only and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    const wrapper = mount(DocumentEditor, { props: { detail: detail() }, global: { plugins: [pinia] } })

    expect(wrapper.text()).toContain('Read-only.')
    expect(wrapper.find('pre').text()).toContain('kind: SealedSecret')
    expect(wrapper.find('pre input, pre textarea').exists()).toBe(false)

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(detail().sealed_secret_yaml)
    expect(wrapper.text()).toContain('The manifest is on the clipboard.')
  })

  it('does not claim the copy succeeded when the clipboard refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const wrapper = mount(DocumentEditor, { props: { detail: detail() }, global: { plugins: [pinia] } })

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Copy YAML')
    expect(wrapper.text()).not.toContain('The manifest is on the clipboard.')
  })

  it('says so when the server returned no manifest', () => {
    const wrapper = mount(DocumentEditor, { props: { detail: detail({ sealed_secret_yaml: '', yaml: '' }) }, global: { plugins: [pinia] } })
    expect(wrapper.text()).toContain('The server did not return a manifest for this Secret.')
    // Nothing to copy, so nothing offers to copy it.
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
