<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
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
// page at all, so it would print the same chip on every card.
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

const cards = computed(() =>
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

    <!-- auto-fill, not auto-fit: auto-fit collapses empty tracks, so three cards
         would render wide and ten narrow. -->
    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
      <li v-for="card in cards" :key="card.namespace.name">
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
