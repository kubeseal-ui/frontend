<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Capability } from '@/types'

const secrets = useSecretsStore()
const auth = useAuthStore()

/**
 * The capabilities worth naming on a card, in the order a reader scanning the
 * grid cares about them.
 *
 * `metadata:read` is deliberately absent. It is the grant that puts a namespace
 * on this page at all, so naming it would print the same chip on every card —
 * which is the mistake the row being replaced already made.
 *
 * These are read through the auth store rather than taken from the namespace
 * payload, and that is the point: `hasCapability` is the call every button in
 * the app is gated on, so a card cannot advertise something the page it links
 * to would then refuse.
 */
const CAPABILITY_LABELS: { capability: Capability; label: string }[] = [
  { capability: 'secret:seal', label: 'Seal' },
  { capability: 'secret:decrypt', label: 'Reveal' },
  { capability: 'gitops:push', label: 'Push' },
  { capability: 'gitops:propose', label: 'Propose' },
  { capability: 'access:manage', label: 'Admin' },
]

/**
 * One row of card data per namespace.
 *
 * Assembled here rather than in the template because each card needs three
 * lookups — its capabilities, its entry in the Git path listing, and the
 * sentence built from both — and resolving them inline would do all of it once
 * per binding.
 */
const cards = computed(() =>
  secrets.namespaces.map((namespace) => {
    const paths = secrets.gitPaths?.namespaces?.find((entry) => entry.namespace === namespace.name) ?? null
    const pathCount = paths?.allowed_paths?.length ?? 0
    const mode = paths?.mode || namespace.delivery_mode || ''
    const repository = paths?.repository || namespace.git_repository || ''
    const branch = paths?.branch ?? ''

    return {
      namespace,
      grants: CAPABILITY_LABELS.filter((entry) => auth.hasCapability(namespace.name, entry.capability)).map(
        (entry) => entry.label,
      ),
      repository: [repository, branch].filter(Boolean).join(' @ '),
      // The Git path listing is the only source for the path count, and it can
      // legitimately be missing: the fetch treats a failure as "no listing" and
      // stores null rather than raising. Falling back to the namespace payload
      // keeps the row truthful instead of blank when that happens, and the
      // last case is the one that says why Create on that page is unavailable.
      summary: paths
        ? `${pathCount} ${pathCount === 1 ? 'path' : 'paths'}${mode ? ` · ${mode}` : ''}`
        : namespace.git_managed
          ? `Git managed${mode ? ` · ${mode}` : ''}`
          : 'No Git mapping',
    }
  }),
)

onMounted(async () => {
  await Promise.all([
    // A listing failure is still reported through the store, which the error
    // branch below renders. Catching it here only stops it leaving this hook as
    // an unhandled rejection.
    secrets.namespaces.length === 0 ? secrets.fetchNamespaces().catch(() => {}) : Promise.resolve(),
    secrets.gitPaths ? Promise.resolve() : secrets.fetchGitPaths(),
  ])
})
</script>

<template>
  <section aria-labelledby="page-title">
    <AppPageHeader eyebrow="Encrypted configuration" title="Namespaces" title-id="page-title">
      <template #actions>
        <AppButton icon="refresh" @click="secrets.fetchNamespaces">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <p v-if="secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading namespaces…
    </p>

    <div v-if="secrets.error" class="grid gap-2 rounded-card-inner border border-danger bg-surface/60 p-4" role="alert">
      <strong>Unable to load namespaces.</strong>
      <p class="mb-1 text-muted">{{ secrets.error.message }}</p>
      <AppButton @click="secrets.fetchNamespaces">Try again</AppButton>
    </div>

    <AppEmpty
      v-else-if="!secrets.loading && secrets.namespaces.length === 0"
      description="No authorized namespaces. Your account has authenticated, but no namespace grants it a capability yet — ask an administrator to map one."
    />

    <!--
      auto-fill rather than auto-fit: with auto-fit an empty grid track
      collapses, so three namespaces render as three wide cards and ten
      render as ten narrow ones. auto-fill keeps every card the same size
      whatever the count, which is what makes a grid of them scannable.
    -->
    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      <li v-for="card in cards" :key="card.namespace.name">
        <!--
          The link covers the whole card rather than wrapping only the text.
          The card lifts as a whole under the pointer, so an inner-text-only
          target makes the affordance a lie: the card responds and then does
          nothing when clicked at its edge.
        -->
        <AppCard class="group">
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(card.namespace.name)}`"
            class="absolute inset-0 z-10 rounded-card-inner"
          >
            <span class="sr-only">{{ card.namespace.name }}</span>
          </RouterLink>

          <div class="flex h-full flex-col gap-2">
            <h2 class="mb-0 flex min-h-[2.5em] items-start gap-2 text-[1.05rem] leading-tight">
              <AppIcon name="namespace" :size="16" class="mt-1 text-accent" />
              <span class="min-w-0 break-words">{{ card.namespace.name }}</span>
            </h2>

            <!-- What this account can do here. Chips rather than a sentence
                 because the set varies per namespace and a reader is scanning
                 for one of them, not reading. A namespace with none of the five
                 is not empty information — it is read-only, which is worth
                 saying outright. -->
            <div class="flex flex-wrap gap-1">
              <span
                v-for="grant in card.grants"
                :key="grant"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >{{ grant }}</span>
              <span
                v-if="card.grants.length === 0"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >Read only</span>
            </div>

            <!-- mt-auto pins the bottom block, so a card whose name wraps to
                 two lines or whose chips wrap to a second row does not push its
                 own footer out of line with the cards beside it. -->
            <div class="mt-auto flex flex-col gap-1">
              <p v-if="card.repository" class="m-0 truncate font-mono text-xs text-muted" :title="card.repository">
                {{ card.repository }}
              </p>
              <p class="m-0 flex items-center justify-between gap-2 text-sm text-muted">
                <span>{{ card.summary }}</span>
                <AppIcon
                  name="arrow-right"
                  :size="16"
                  class="text-accent opacity-0 transition-opacity group-hover:opacity-100"
                />
              </p>
            </div>
          </div>
        </AppCard>
      </li>
    </ul>
  </section>
</template>
