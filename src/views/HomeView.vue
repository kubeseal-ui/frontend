<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
import { useSecretsStore } from '@/stores/secrets'

const secrets = useSecretsStore()

onMounted(async () => {
  if (secrets.namespaces.length === 0) await secrets.fetchNamespaces()
})
</script>

<template>
  <section aria-labelledby="page-title">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-accent">Encrypted configuration</p>
        <h1 id="page-title" class="mb-0 text-[clamp(1.8rem,4vw,2.5rem)] tracking-tight">Namespaces</h1>
      </div>
      <NButton secondary @click="secrets.fetchNamespaces">Refresh</NButton>
    </div>

    <NSpin :show="secrets.loading">
      <div v-if="secrets.error" class="grid gap-2 rounded-card-inner border border-danger bg-surface/60 p-4" role="alert">
        <strong>Unable to load namespaces.</strong>
        <p class="mb-1 text-muted">{{ secrets.error.message }}</p>
        <NButton @click="secrets.fetchNamespaces">Try again</NButton>
      </div>

      <NEmpty
        v-else-if="secrets.namespaces.length === 0"
        description="No authorized namespaces. Your account has authenticated, but no namespace grants it a capability yet — ask an administrator to map one."
      />

      <!--
        auto-fill rather than auto-fit: with auto-fit an empty grid track
        collapses, so three namespaces render as three wide cards and ten
        render as ten narrow ones. auto-fill keeps every card the same size
        whatever the count, which is what makes a grid of them scannable.
      -->
      <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        <li v-for="namespace in secrets.namespaces" :key="namespace.name">
          <!--
            The link covers the whole card rather than wrapping only the text.
            NCard renders a hover affordance for the entire surface, so an
            inner-text-only target makes the affordance a lie: the card lifts
            under the pointer and then does nothing when clicked at its edge.
          -->
          <NCard class="glass group h-full" hoverable>
            <RouterLink
              :to="`/namespaces/${encodeURIComponent(namespace.name)}`"
              class="absolute inset-0 z-10 rounded-card-inner"
            >
              <span class="sr-only">{{ namespace.name }}</span>
            </RouterLink>

            <!-- mt-auto pins the metadata row to the bottom, so a namespace
                 whose name wraps to two lines does not push its own metadata
                 out of line with the cards beside it. -->
            <div class="flex h-full flex-col gap-1">
              <h2 class="mb-0 min-h-[2.5em] break-words text-[1.05rem] leading-tight">{{ namespace.name }}</h2>
              <p class="mt-auto mb-0 flex items-center justify-between gap-2 text-sm text-muted">
                <span>
                  {{ namespace.git_managed ? 'Git managed' : 'unmanaged' }}
                  <template v-if="namespace.delivery_mode"> · {{ namespace.delivery_mode }}</template>
                </span>
                <span aria-hidden="true" class="text-accent opacity-0 transition-opacity group-hover:opacity-100">→</span>
              </p>
            </div>
          </NCard>
        </li>
      </ul>
    </NSpin>
  </section>
</template>
