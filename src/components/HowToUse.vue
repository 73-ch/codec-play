<script setup lang="ts">
import { ref } from "vue";

const isShowed = ref<boolean>(false);
</script>

<template>
  <button @click="isShowed = !isShowed">How to Use</button>

  <transition name="modal">
    <div
      class="modal-mask content-wrapper"
      v-if="isShowed"
      @click="isShowed = false"
    >
      <div class="modal-wrapper">
        <iframe
          width="840"
          height="480"
          src="https://www.youtube.com/embed/exW7C2eFaw4?si=sSm4TwWkaI7Q_E6l"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  z-index: 10;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.5s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-wrapper {
  display: table-cell;
  vertical-align: middle;
}
</style>
