<script setup lang="ts">
// HomeView: minimal landing page used by the MVP. Confirms the Vue + Naive UI
// stack is wired correctly and that the router is mounted. Phase-2 will
// replace this with the namespace browser.
import { NCard, NSpace, NText } from 'naive-ui'
</script>

<template>
  <NCard title="kubeseal-ui">
    <NSpace vertical>
      <NText>kubeseal-ui MVP scaffold is up.</NText>
      <NText depth="3">
        Real views (namespace browser, secret editor, GitOps delivery) land in
        subsequent phases per internal-docs/implementation/phase-2.md.
      </NText>
    </NSpace>
  </NCard>
</template>
