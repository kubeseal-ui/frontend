<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import DiffBlocks from '@/components/DiffBlocks.vue'
import PendingBar from '@/components/PendingBar.vue'
import ProgressRail from '@/components/ProgressRail.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import { describeError } from '@/api'
import { renderNamespace, templateDirectory } from '@/utils/gitPath'
import { revealRegion } from '@/utils/reveal'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { WorkflowStep } from '@/types'

const props = defineProps<{ namespace: string }>()
const auth = useAuthStore()
const secrets = useSecretsStore()

const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// Fixed per namespace; an unmapped namespace can still be encrypted, so the spine says so before the manifest is written.
const deliveryMode = computed(() => secrets.namespaceDeliveryMode(props.namespace))
const hasDeliveryPolicy = computed(() => Boolean(deliveryMode.value))
const mapping = computed(() => secrets.namespaceGitPaths(props.namespace))

// Rendered the way the server renders them, so the spine lists paths rather than templates; the default is the one the template itself lands in.
const allowedPaths = computed(() => (mapping.value?.allowed_paths || []).map((directory) => renderNamespace(directory, props.namespace)))
const defaultDirectory = computed(() => templateDirectory(mapping.value?.path_template || '', props.namespace))
// A wildcard names no paths: the server renders the target from a template the listing does not carry.
const isWildcard = computed(() => mapping.value?.namespace === '*')

// What the form is typing; the listing rides in the search index, one request for the whole fleet.
const typedName = ref('')
const existingNames = computed(() => secrets.index.filter((entry) => entry.namespace === props.namespace).map((entry) => entry.name))

onMounted(() => {
  // The form reads the same listing; either may mount first.
  if (!secrets.gitPaths) secrets.fetchGitPaths()
  // The spine names what is already here, which is the index the strip loads for search.
  if (!secrets.indexLoaded && !secrets.indexLoading) secrets.fetchIndex().catch(() => {})
})

// A create's first press is Encrypt, inside the name editor; what is left of the three is the same bar the edit path runs.
const step = computed<WorkflowStep>(() => (secrets.check ? 'deliver' : 'check'))
const busy = ref(false)
const pressError = ref('')
const canDeliver = computed(() => {
  const required = requiredDeliveryCapability(deliveryMode.value)
  return required ? auth.hasCapability(props.namespace, required) : false
})
const ready = computed(() => (step.value === 'deliver' ? canDeliver.value : true))

// The four stops the create flow passes through; Compose is the only stop with a way back, and the rail marks which one the operator is standing on.
const editorRef = ref<{ edit?: () => void } | null>(null)
const composeSection = ref<HTMLElement | null>(null)
const railSteps = [
  { key: 'compose', label: 'Compose', back: true },
  { key: 'review', label: 'Review' },
  { key: 'check', label: 'Check' },
  { key: 'deliver', label: 'Deliver' },
]
const activeStep = computed(() => (secrets.delivery ? 3 : secrets.check ? 2 : secrets.change?.encrypted ? 1 : 0))
// Where the checked dry-run says the manifest will land; a new Secret has no file in Git, so this is what makes "it passed" visible.
const checkedPath = computed(() => secrets.check?.result.path || '')
function onRailNavigate(key: string) {
// Only Compose steps back: from a landed delivery that starts a fresh Secret; from a draft it is the fold's own Edit, and everything below returns with it.
  if (key !== 'compose') return
  if (secrets.delivery) { startAnother(); return }
  editorRef.value?.edit?.()
  revealRegion(() => composeSection.value)
}

// A landed delivery is terminal: the spent draft and its diff come off the screen, leaving the confirmation alone.
function startAnother() {
  secrets.discardChange()
  revealRegion(() => composeSection.value)
}

async function press() {
  if (!ready.value) return
  busy.value = true; pressError.value = ''
  try {
    if (step.value === 'check') await secrets.checkDraft()
    else await secrets.deliverChange()
  } catch (e) {
    pressError.value = describeError(e, 'The workflow could not be advanced')
  } finally { busy.value = false }
}

// Each press carries the viewport to its result below the form, so nothing lands off the bottom of the page.
const draftSection = ref<HTMLElement | null>(null)
const deliveryAlert = ref<{ $el?: HTMLElement } | null>(null)
const pressErrorAlert = ref<{ $el?: HTMLElement } | null>(null)
watch(() => Boolean(secrets.change?.encrypted), (encrypted) => {
  if (encrypted) revealRegion(() => draftSection.value)
})
watch(() => secrets.delivery, (delivered) => {
  if (delivered) revealRegion(() => deliveryAlert.value?.$el, { focus: true })
})
// A refused press is carried into view and focused, so a failure is never silent off the bottom of the page.
watch(pressError, (next) => { if (next) revealRegion(() => pressErrorAlert.value?.$el, { focus: true }) })

// A half-finished encrypted draft belongs to this page and would follow the user to the next one.
onUnmounted(() => secrets.discardChange())
</script>

<template>
  <section aria-labelledby="page-title">
    <!-- One padding block for the page body, the mockup's `24px 26px 30px`: heading and grid are the same column. -->
    <div class="page-x pt-6">
      <div class="min-w-0">
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
          class="mb-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted no-underline hover:text-ink"
        >
          <AppIcon name="chevron-left" :size="12" />{{ props.namespace }}
        </RouterLink>
        <h1 id="page-title" class="m-0 font-mono text-[30px] font-semibold tracking-[-0.025em] text-ink">New Secret</h1>
        <p class="mt-2 mb-0.5 flex flex-wrap items-baseline gap-[7px] text-[13px] text-muted">
          in <span class="font-mono text-ink">{{ props.namespace }}</span>
          <template v-if="mapping">
            <span class="text-border-strong" aria-hidden="true">·</span>
            delivering to <span class="font-mono text-ink">{{ mapping.repository }} @ {{ mapping.branch }}</span>
          </template>
        </p>
      </div>
    </div>

    <div class="page-x pb-[30px]">
      <AppAlert v-if="!canSeal" type="error" title="Access denied">
        <p class="m-0 max-w-[62ch] text-[13px] text-muted">
          Creating a SealedSecret in {{ props.namespace }} requires the
          <code class="font-mono">secret:seal</code> capability, which your account does not have here.
        </p>
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
          class="mt-2 inline-block font-semibold text-accent no-underline"
        >Back to {{ props.namespace }}</RouterLink>
      </AppAlert>

      <!-- The mockup's `1fr 210px` at 30px gap; the card drops below the form where the mockup drops it. -->
      <div v-else class="grid grid-cols-1 items-start gap-x-[30px] gap-y-8 min-[820px]:grid-cols-[1fr_210px]">
        <div class="flex min-w-0 flex-col">
          <!-- Sticky offset is the pinned header's height (59px desktop, 105px phone — see AppShell); change together. The rail's own `18px 0 20px` is the padding here. -->
          <div class="sticky top-[59px] max-sm:top-[105px] z-10 bg-bg pt-[18px] pb-5">
            <ProgressRail :steps="railSteps" :active="activeStep" @navigate="onRailNavigate" />
          </div>

          <!-- A delivered draft takes the editor off the screen; the confirmation below is the whole task now. -->
          <div v-show="!secrets.delivery" ref="composeSection">
            <SecretNameEditor ref="editorRef" :namespace="props.namespace" @update:name="typedName = $event" />
          </div>

          <!-- Each result opens where it lands rather than replacing the last one. The section is always here — a fold cannot animate a region that arrives already open. The action bar is its sibling, not one of its regions: sticky positioning is bounded by the containing block. -->
          <section
            ref="draftSection"
            class="fold-stack"
            :aria-label="secrets.change?.encrypted || secrets.delivery ? 'Encrypted draft' : undefined"
          >
            <div class="fold" :class="{ open: Boolean(secrets.change?.encrypted) }">
              <div>
                <!-- The ciphertext under review; once delivered it is spent and comes off the screen. -->
                <DiffBlocks
                  v-if="!secrets.delivery"
                  :after="secrets.check?.result.after || secrets.change?.encrypted || ''"
                  :before="secrets.check?.result.before"
                  :after-label="secrets.check ? 'Checked against the branch' : undefined"
                />
              </div>
            </div>

            <!-- The check adds this line and moves the heading above it; the amount of motion is the amount of change. -->
            <div class="fold" :class="{ open: Boolean(secrets.check) && !secrets.delivery }">
              <div>
                <!-- A new Secret has no file in Git to diff against, so a passing dry-run is stated outright. -->
                <p v-if="secrets.check && !secrets.delivery" class="flex items-center gap-1.5 text-[13px] text-success">
                  <AppIcon name="check" :size="14" />
                  <span>The sealed manifest applies cleanly<template v-if="checkedPath"> at <span class="font-mono">{{ checkedPath }}</span></template>. Deliver writes it to Git.</span>
                </p>
              </div>
            </div>

            <div class="fold" :class="{ open: Boolean(secrets.delivery) }">
              <div>
                <!-- A create that delivered and said nothing would leave a spent draft on screen with no record of where it went. -->
                <AppAlert v-if="secrets.delivery" ref="deliveryAlert" type="success" :title="deliveryHeading(secrets.delivery)">
                  <span class="block text-[13px] text-muted">{{ summarizeDelivery(secrets.delivery) }}</span>
                  <a
                    v-if="secrets.delivery.proposal_url"
                    :href="secrets.delivery.proposal_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 block break-all text-[13px] text-accent no-underline hover:underline"
                  >{{ secrets.delivery.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
                  <span v-if="!secrets.delivery.argocd_sync_verified" class="mt-1 block text-[13px] text-muted">A GitOps controller has not confirmed this reached the cluster.</span>
                  <!-- The next step rides with the confirmation rather than a workflow bar below a spent draft. -->
                  <AppButton class="mt-2.5 self-start" size="small" icon="lock" @click="startAnother">Encrypt another Secret</AppButton>
                </AppAlert>
              </div>
            </div>
          </section>

          <AppAlert v-if="pressError" ref="pressErrorAlert" type="error" closable title="Operation failed" class="mt-4" @close="pressError = ''">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ pressError }}</p>
          </AppAlert>
          <!-- The sticky action bar is the live workflow only; a delivered draft's confirmation carries what comes next. It spans the form column so its primary control sits on the same right edge as the compose stage's bar. Count is 1: a create writes exactly one file. -->
          <PendingBar
            v-if="secrets.change?.encrypted && !secrets.delivery"
            :step="step"
            :mode="deliveryMode"
            :count="1"
            :ready="ready"
            :busy="busy"
            @press="press"
          />
        </div>

        <!-- What the form is writing into, stated beside it. -->
        <aside aria-label="Namespace context" class="flex min-w-0 flex-col gap-5">
          <div>
            <h2 class="mb-[9px] text-xs font-[650] text-muted">This namespace</h2>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">Delivery</span>
              <span class="font-mono text-xs" :class="hasDeliveryPolicy ? 'text-ink' : 'text-warning'">{{ hasDeliveryPolicy ? deliveryMode : 'not configured' }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">SealedSecrets</span>
              <span class="font-mono text-xs text-ink">{{ secrets.indexLoaded ? existingNames.length : '…' }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">You can seal here</span>
              <span class="font-mono text-xs" :class="canSeal ? 'text-success' : 'text-danger'">{{ canSeal ? '✓' : '✗' }}</span>
            </div>
          </div>

          <div>
            <h2 class="mb-[9px] text-xs font-[650] text-muted">Allowed directories</h2>
            <div v-for="path in allowedPaths" :key="path" class="flex items-baseline justify-between gap-3 py-[3px]">
              <span class="min-w-0 truncate font-mono text-xs text-ink" :title="path">{{ path }}</span>
              <span v-if="path === `${defaultDirectory}/`" class="shrink-0 text-[11.5px] text-faint">default</span>
            </div>
            <p v-if="allowedPaths.length === 0 && isWildcard" class="m-0 py-[3px] text-[13px] text-muted">
              Rendered per Secret from this namespace's mapping.
            </p>
            <p v-else-if="allowedPaths.length === 0" class="m-0 py-[3px] text-[13px] text-muted">No directories mapped.</p>
          </div>

          <div v-if="secrets.indexLoaded">
            <h2 class="mb-[9px] text-xs font-[650] text-muted">Already here</h2>
            <div v-for="existing in existingNames" :key="existing" class="flex items-baseline justify-between gap-3 py-[3px]">
              <span class="min-w-0 truncate font-mono text-xs text-ink" :title="existing">{{ existing }}</span>
              <span v-if="existing === typedName.trim()" class="shrink-0 text-[11.5px] font-semibold text-danger">taken</span>
            </div>
            <p v-if="existingNames.length === 0" class="m-0 py-[3px] text-[13px] text-muted">No SealedSecrets yet.</p>
          </div>

          <AppAlert v-if="!hasDeliveryPolicy" type="info" title="No Git delivery for this namespace">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">
              This namespace has no Git mapping, so the encrypted manifest can be produced and reviewed here but not delivered. Ask a platform administrator to map the namespace.
            </p>
          </AppAlert>
        </aside>
      </div>
    </div>
  </section>
</template>
