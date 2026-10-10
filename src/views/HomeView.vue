<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { countLabel } from '@/utils/format'
import type { Capability, Namespace, NamespaceGitPaths } from '@/types'

const secrets = useSecretsStore()
const auth = useAuthStore()

// `metadata:read` is deliberately absent: it is the grant that puts a namespace on this
// page at all, so it would print the same chip on every row.
const CAPABILITY_LABELS: { capability: Capability; label: string }[] = [
  { capability: 'secret:seal', label: 'Seal' },
  { capability: 'secret:decrypt', label: 'Reveal' },
  { capability: 'gitops:push', label: 'Push' },
  { capability: 'gitops:propose', label: 'Propose' },
  { capability: 'access:manage', label: 'Admin' },
]

// "No mapping" is claimed only once the listing has loaded: an absent listing also means
// the request failed, and those are not the same fact.
function gitSummary(namespace: Namespace, paths: NamespaceGitPaths | null): string {
  const mode = paths?.mode || namespace.delivery_mode || ''
  if (paths) {
    // A wildcard is the mapping this namespace falls back to rather than one of its own, and it
    // has no directory count to print: "0 directories" would read as "nowhere to deliver".
    if (paths.namespace === '*') return `Shared mapping${mode ? ` · ${mode}` : ''}`
    const count = paths.allowed_paths?.length ?? 0
    return `${count} ${count === 1 ? 'directory' : 'directories'}${mode ? ` · ${mode}` : ''}`
  }
  if (namespace.git_managed) return `Git managed${mode ? ` · ${mode}` : ''}`
  return secrets.gitPathsLoaded ? 'No Git mapping' : 'Git status unavailable'
}

// The value every row agrees on, or null when they differ. An empty string counts as no shared
// fact — "every namespace maps to nothing" is not a sentence worth printing.
function sharedString(values: string[]): string | null {
  return values.every((value) => value === values[0]) ? values[0] : null
}

// "Seal and Reveal", "Seal, Reveal, and Admin": the comma before the last item matches the
// lists in the documentation, and two items joined as "Seal, and Reveal" would read as a typo.
function listSentence(values: string[]): string {
  if (values.length < 2) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

const filter = ref('')

// What the rail does not carry: the rail is a namespace tree for navigation, so the grants
// and the delivery destination have nowhere else to be read.
const rows = computed(() =>
  secrets.namespaces.map((namespace) => {
    const paths = secrets.namespaceGitPaths(namespace.name)
    const repository = paths?.repository || namespace.git_mapping || ''
    const branch = paths?.branch ?? ''

    return {
      name: namespace.name,
      grants: CAPABILITY_LABELS.filter((entry) => auth.hasCapability(namespace.name, entry.capability)).map(
        (entry) => entry.label,
      ),
      repository: [repository, branch].filter(Boolean).join(' @ '),
      mode: paths?.mode || namespace.delivery_mode || '',
      summary: gitSummary(namespace, paths),
    }
  }),
)

// Collapsing only pays across more than one row, and one condition drives both the sentence
// and the rows: a fact withheld from a row has to be stated above it, or it is simply lost.
const collapsing = computed(() => rows.value.length > 1)

// A fact every namespace shares is stated once here. Printed per row it was the same grants on
// twenty rows, when the name is the only thing that actually differs between them.
const uniform = computed(() => {
  if (!collapsing.value) return { repository: null, summary: null, mode: '', grants: null as string[] | null }
  return {
    repository: sharedString(rows.value.map((row) => row.repository)) || null,
    summary: sharedString(rows.value.map((row) => row.summary)),
    mode: sharedString(rows.value.map((row) => row.mode)) ?? '',
    grants: sharedString(rows.value.map((row) => row.grants.join(', '))) === null ? null : rows.value[0].grants,
  }
})

// The clause names the delivery mode only when the rows agreed on the summary as well: a row
// that keeps its own summary is already stating its own mode.
const sharedFacts = computed(() => {
  if (!collapsing.value) return ''
  const clauses: string[] = []
  if (uniform.value.repository) {
    const where = uniform.value.repository
    const mode = uniform.value.summary === null ? '' : uniform.value.mode
    clauses.push(
      mode === 'proposal' ? `delivers to ${where} as a proposal`
      : mode === 'direct' ? `delivers straight to ${where}`
      : `delivers to ${where}`,
    )
  }
  if (uniform.value.grants) {
    clauses.push(uniform.value.grants.length ? `grants ${listSentence(uniform.value.grants)}` : 'grants nothing beyond read')
  }
  return clauses.length ? `Every namespace ${clauses.join(' and ')}.` : ''
})

const visibleRows = computed(() => {
  const query = filter.value.trim().toLowerCase()
  if (!query) return rows.value
  return rows.value.filter((row) => row.name.toLowerCase().includes(query))
})

onMounted(async () => {
  await Promise.all([
    // Reported through the store, which the error branch renders; catching here only
    // stops it leaving this hook as an unhandled rejection.
    secrets.namespaces.length === 0 ? secrets.fetchNamespaces().catch(() => {}) : Promise.resolve(),
    secrets.gitPaths ? Promise.resolve() : secrets.fetchGitPaths(),
  ])
})
</script>

<template>
  <section aria-labelledby="page-title">
    <AppPageHeader
      eyebrow="Encrypted configuration"
      title="Namespaces"
      title-id="page-title"
      :subtitle="rows.length ? countLabel(rows.length, 'namespace') : ''"
    >
      <template #actions>
        <AppButton icon="refresh" @click="secrets.fetchNamespaces">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <p v-if="secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading namespaces…
    </p>

    <AppAlert v-if="secrets.error" type="error" title="Unable to load namespaces">
      <p class="m-0">{{ describeError(secrets.error, 'Unable to load namespaces') }}</p>
      <AppButton class="mt-2" icon="refresh" @click="secrets.fetchNamespaces">Try again</AppButton>
    </AppAlert>

    <AppEmpty
      v-else-if="!secrets.loading && secrets.namespaces.length === 0"
      description="No authorized namespaces. Your account has authenticated, but no namespace grants it a capability yet — ask an administrator to map one."
    />

    <template v-else>
      <p v-if="sharedFacts" class="mt-0 mb-4 max-w-prose text-sm text-muted">{{ sharedFacts }}</p>

      <div v-if="collapsing" class="mb-4 flex flex-wrap items-center gap-3">
        <AppInput
          v-model="filter"
          type="search"
          aria-label="Filter namespaces"
          placeholder="Filter namespaces"
          class="max-w-xs"
        />
        <p v-if="filter.trim() && visibleRows.length" role="status" class="m-0 text-sm text-muted">
          Showing {{ visibleRows.length }} of {{ rows.length }} namespaces.
        </p>
      </div>

      <AppEmpty
        v-if="visibleRows.length === 0"
        icon="namespace"
        :description="`No namespace matches “${filter.trim()}”.`"
      />

      <!-- Rows, not a card each: the rail holds the screen's card-level surface, and a second
           grid beside it would state the same names twice at the same weight. -->
      <ul v-else class="m-0 list-none border-t border-border p-0" aria-label="Namespaces">
        <li v-for="row in visibleRows" :key="row.name" class="border-b border-border">
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(row.name)}`"
            class="group flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5 no-underline transition hover:bg-surface-raised focus-visible:bg-surface-raised"
          >
            <h2 class="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-ink">{{ row.name }}</h2>

            <!-- Only what this row does not share with the rest. -->
            <span v-if="!uniform.grants" class="flex flex-wrap gap-1">
              <span
                v-for="grant in row.grants"
                :key="grant"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >{{ grant }}</span>
              <span
                v-if="row.grants.length === 0"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >Read only</span>
            </span>

            <span v-if="!uniform.repository && row.repository" class="truncate font-mono text-xs text-muted" :title="row.repository">
              {{ row.repository }}
            </span>
            <span v-if="!uniform.summary" class="text-xs text-muted">{{ row.summary }}</span>

            <!-- The one glyph that stays: the row is a link, and this is what says so. -->
            <AppIcon name="arrow-right" :size="14" class="shrink-0 text-muted transition group-hover:text-accent" />
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>
