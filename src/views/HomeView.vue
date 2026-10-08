<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { useSecretsStore } from '@/stores/secrets'

const secrets = useSecretsStore()

onMounted(async () => {
  if (secrets.namespaces.length === 0) await secrets.fetchNamespaces()
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
      <li v-for="namespace in secrets.namespaces" :key="namespace.name">
        <!--
          The link covers the whole card rather than wrapping only the text.
          The card lifts as a whole under the pointer, so an inner-text-only
          target makes the affordance a lie: the card responds and then does
          nothing when clicked at its edge.
        -->
        <AppCard class="group">
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
            <h2 class="mb-0 flex min-h-[2.5em] items-start gap-2 text-[1.05rem] leading-tight">
              <AppIcon name="namespace" :size="16" class="mt-1 text-accent" />
              <span class="min-w-0 break-words">{{ namespace.name }}</span>
            </h2>
            <p class="mt-auto mb-0 flex items-center justify-between gap-2 text-sm text-muted">
              <span>
                {{ namespace.git_managed ? 'Git managed' : 'unmanaged' }}
                <template v-if="namespace.delivery_mode"> · {{ namespace.delivery_mode }}</template>
              </span>
              <AppIcon
                name="arrow-right"
                :size="16"
                class="text-accent opacity-0 transition-opacity group-hover:opacity-100"
              />
            </p>
          </div>
        </AppCard>
      </li>
    </ul>
  </section>
</template>
