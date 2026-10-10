<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
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
    // A wildcard covers every namespace through a template the listing does not expose,
    // so it has no directory count; "0 directories" would read as "nowhere to deliver".
    if (paths.namespace === '*') return `All namespaces${mode ? ` · ${mode}` : ''}`
    const count = paths.allowed_paths?.length ?? 0
    return `${count} ${count === 1 ? 'directory' : 'directories'}${mode ? ` · ${mode}` : ''}`
  }
  if (namespace.git_managed) return `Git managed${mode ? ` · ${mode}` : ''}`
  return secrets.gitPathsLoaded ? 'No Git mapping' : 'Git status unavailable'
}

// What the rail does not carry: the rail is a namespace tree for navigation, so the grants
// and the delivery destination have nowhere else to be read.
const rows = computed(() =>
  secrets.namespaces.map((namespace) => {
    const paths = secrets.namespaceGitPaths(namespace.name)
    const repository = paths?.repository || namespace.git_mapping || ''
    const branch = paths?.branch ?? ''

    return {
      namespace,
      grants: CAPABILITY_LABELS.filter((entry) => auth.hasCapability(namespace.name, entry.capability)).map(
        (entry) => entry.label,
      ),
      repository: [repository, branch].filter(Boolean).join(' @ '),
      summary: gitSummary(namespace, paths),
    }
  }),
)

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
    <AppPageHeader eyebrow="Encrypted configuration" title="Namespaces" title-id="page-title">
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

    <!-- Rows, not a card each: the rail holds the screen's card-level surface, and a second
         grid beside it would state the same names twice at the same weight. -->
    <ul v-else class="m-0 list-none border-t border-border p-0" aria-label="Namespaces">
      <li v-for="row in rows" :key="row.namespace.name" class="border-b border-border">
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(row.namespace.name)}`"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 no-underline transition hover:bg-surface-raised focus-visible:bg-surface-raised"
        >
          <AppIcon name="namespace" :size="16" class="shrink-0 text-accent" />
          <h2 class="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-ink">{{ row.namespace.name }}</h2>

          <span class="flex flex-wrap gap-1">
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

          <span v-if="row.repository" class="truncate font-mono text-xs text-muted" :title="row.repository">
            {{ row.repository }}
          </span>
          <span class="text-sm text-muted">{{ row.summary }}</span>
          <AppIcon name="arrow-right" :size="14" class="shrink-0 text-accent" />
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
