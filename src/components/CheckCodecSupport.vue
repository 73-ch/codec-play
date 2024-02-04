<script lang="ts" setup>
import { onMounted, ref } from "vue";

const supportedRef = ref<boolean>(false);

onMounted(() => {
  supportedRef.value = !!window.VideoEncoder;

  if (!supportedRef.value) {
    alert(
      [
        "Your browser does not support WebCodecs.",
        "Please Use Latest Chrome",
      ].join(" "),
    );
  }
});
</script>

<template>
  <div v-if="!supportedRef">
    WebCodecs supported:
    <span id="web-codecs-supported">{{ supportedRef ? "yes" : "no" }}</span>
    <p>Please Use Latest Chrome!!</p>
  </div>
</template>

<style scoped></style>
