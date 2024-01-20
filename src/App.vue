<script setup lang="ts">
import { ref } from "vue";
import { drawImageToCanvas, drawNoiseToCanvas } from "./assets/CanvasUtils.ts";

const encodedRef = ref<HTMLCanvasElement>();

const modeProbabilityRef = ref<number>(0.1);

const width = 864;
const height = 864;

const encoderNumRef = ref<number>(2);
const codecStringRef = ref<string>("av01.0.04M.10.0.110.09.16.09.0");

const exportCounterRef = ref<number>(0);

const fpsRef = ref<number>(60);

// encode canvas setup
let encodeCtx: CanvasRenderingContext2D;

let exportFlagRef = ref<boolean>(false);
let forceKeyFlagRef = ref<boolean>(false);

let requestResetFlagRef = ref<boolean>(false);

let decoder: VideoDecoder;
const encoders: { encoder: VideoEncoder; counter: number }[] = [];

let counter = 0;
let mode = 0;
let dir: number[] = [0, 0];
let modeInterval = 30;
let modeCounter = 0;

async function handleDecodeOutput(chunk: VideoFrame) {
  if (mode == 1) {
    encodeCtx.drawImage(
      chunk,
      Math.random() * 100 - 5,
      Math.random() * 100 - 5,
      Math.random() * width * 0.5 + width * 0.5,
      Math.random() * height * 0.5 + height * 0.5,
    );
  } else if (mode === 2) {
    encodeCtx.drawImage(
      chunk,
      (counter % modeInterval) * dir[0],
      (counter % modeInterval) * dir[1],
    );
  } else {
    encodeCtx.drawImage(chunk, 0, 0);
  }

  modeCounter++;

  // update mode
  if (modeCounter > modeInterval) {
    mode = 0;
    modeCounter = 0;

    if (Math.random() < modeProbabilityRef.value) {
      mode = Math.floor(Math.random() * 3);

      if (mode === 2) {
        dir = [
          Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
          Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
        ];

        dir[0] === 0 && dir[1] === 0 && (dir[0] = 8 * Math.random());
      }

      modeInterval = Math.floor(Math.random() * 100) + 10;
    }
  }

  chunk.close();
}

function createDecoder(codecString: string) {
  decoder = new VideoDecoder({
    output: handleDecodeOutput,
    error: async function (e) {
      console.error(e);

      createDecoder(codecStringRef.value);

      forceKeyFlagRef.value = true;
      await decoder.flush();
    },
  });

  decoder.configure({
    codec: codecString,
    hardwareAcceleration: "prefer-software",
  });
}

async function handleEncodeOutput(chunk: EncodedVideoChunk) {
  try {
    decoder.decode(chunk);
  } catch (e) {
    forceKeyFlagRef.value = true;
  }
}

function createEncoders(codecString: string) {
  for (let i = 0; i < encoderNumRef.value; ++i) {
    const encoder = new VideoEncoder({
      output: handleEncodeOutput,
      error: function (e) {
        console.error(e, arguments);
        forceKeyFlagRef.value = true;
      },
    });

    encoder.configure({
      codec: codecString,
      width: width,
      height: height,
      avc: {
        format: "annexb",
      },
    });

    encoders.push({
      encoder,
      counter: 0,
    });
  }
}

async function start() {
  console.log("mounted");
  encodeCtx = encodedRef.value!.getContext("2d", {
    willReadFrequently: true,
  })!;

  await drawImageToCanvas(encodeCtx, "/noise.png");
  drawNoiseToCanvas(encodeCtx);

  const stream = encodedRef.value!.captureStream(30);
  const [videoTrack] = stream.getVideoTracks();
  createDecoder(codecStringRef.value);
  createEncoders(codecStringRef.value);

  const reader = async () => {
    const processor = new MediaStreamTrackProcessor(videoTrack);
    const frameReader = processor.readable.getReader();

    const { done, value: videoFrame } = await frameReader.read();

    if (done) {
      console.log("reader done");
      return;
    }

    const targetEncoder = encoders[Math.floor(Math.random() * encoders.length)];

    targetEncoder.encoder.encode(videoFrame, {
      keyFrame: forceKeyFlagRef.value || targetEncoder.counter % 30 === 0,
    });

    forceKeyFlagRef.value = false;

    targetEncoder.counter++;

    counter++;
    videoFrame.close();

    frameReader.releaseLock();
  };

  let updateCounter = 0;

  let lastUpdated = performance.now();

  async function update() {
    if (requestResetFlagRef.value) {
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);

      requestResetFlagRef.value = false;
      forceKeyFlagRef.value = true;
    }

    // 60 fps
    if (updateCounter % Math.floor(60 / fpsRef.value) === 0) {
      await reader();
    }

    // export
    if (exportFlagRef.value) {
      exportCounterRef.value++;
      const url = encodedRef.value!.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${exportCounterRef.value.toString().padStart(5, "0")}.png`;
      a.click();
      await new Promise((resolve) => {
        setTimeout(resolve, 1000 / 10);
      });
    }

    const current = performance.now();

    updateCounter++;

    if (exportFlagRef.value) {
      update();
    } else {
      setTimeout(update, 1000 / 60 - (current - lastUpdated));
    }

    lastUpdated = current;
  }

  // start
  update();
}

function presetVP8() {
  encoderNumRef.value = 8;
  codecStringRef.value = "vp8";
  fpsRef.value = 10;
  requestResetFlagRef.value = true;
}

function presetAVC() {
  codecStringRef.value = "avc1.4d002a";
  encoderNumRef.value = 5;
  fpsRef.value = 30;
  requestResetFlagRef.value = true;
}

function presetVP9() {
  encoderNumRef.value = 2;
  codecStringRef.value = "vp09.02.10.10.01.09.16.09.01";
  requestResetFlagRef.value = true;
  fpsRef.value = 30;
}

function presetAV1() {
  codecStringRef.value = "av01.0.04M.10.0.110.09.16.09.0";
  encoderNumRef.value = 2;
  requestResetFlagRef.value = true;
  fpsRef.value = 30;
}

function redrawNoise() {
  drawNoiseToCanvas(encodeCtx);
}
</script>
<template>
  <section>
    <div>
      <div>
        <button @click="start">start</button>
        <button @click="redrawNoise">redrawNoise</button>
      </div>
      <div>
        <button @click="presetVP8">vp8</button>
        <button @click="presetVP9">vp9</button>
        <button @click="presetAV1">av1</button>
        <button @click="presetAVC">avc</button>
      </div>
    </div>

    <div>
      <div>
        <label for="modeProbability">modeProbability</label>
        <input
          name="modeProbability"
          type="number"
          min="0"
          max="1"
          step="0.01"
          v-model="modeProbabilityRef"
        />
      </div>
      <div>
        <label for="codecString">codecString</label>
        <input name="codecString" type="text" v-model="codecStringRef" />
      </div>
      <div>
        <label for="encoderNum">encoderNum</label>
        <input name="encoderNum" type="number" v-model="encoderNumRef" />
      </div>
      <div>
        <label for="fps">fps</label>
        <input name="fps" type="number" v-model="fpsRef" />
      </div>
      <div>
        <label for="forceKeyFlag">forceKeyFlag</label>

        <input name="forceKeyFlag" type="checkbox" v-model="forceKeyFlagRef" />
      </div>

      <div>
        <label for="exportFlag">exportFlag</label>

        <input name="exportFlag" type="checkbox" v-model="exportFlagRef" />
      </div>
      <div>
        <label for="exportCounter">exportCounter</label>

        <input name="exportCounter" type="number" v-model="exportCounterRef" />
      </div>
    </div>
  </section>

  <canvas width="864" height="864" ref="encodedRef"></canvas>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: row;
  align-items: center;
}

canvas {
  width: 864px;
  height: 864px;
  border: none;
}
</style>
