<script setup lang="ts">
import { ref } from "vue";
import { drawImageToCanvas, drawNoiseToCanvas } from "./assets/CanvasUtils.ts";

// export
const urlParams = new URLSearchParams(window.location.search);
const exportEanbledRef = ref<boolean>(urlParams.has("export"));

const encodedRef = ref<HTMLCanvasElement>();

const modeProbabilityRef = ref<number>(0);

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

let stopRenderFlagRef = ref<boolean>(false);
let notimeUpdateFlagRef = ref<boolean>(false);

let decoder: VideoDecoder;
const encoders: { encoder: VideoEncoder; counter: number }[] = [];

let counter = 0;
const modeRef = ref<number>(0);
let dir: number[] = [0, 0];
let modeInterval = 30;
let modeCounter = 0;

function updateMode(event?: InputEvent) {
  if (event && event.target && event.target instanceof HTMLInputElement) {
    modeRef.value = +event.target.value;
  }

  console.log("update mode", modeRef.value);
  if (modeRef.value === 2) {
    dir = [
      Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
      Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
    ];

    dir[0] === 0 && dir[1] === 0 && (dir[0] = 8 * Math.random());
  }

  modeInterval = Math.floor(Math.random() * 400) + 5;
  modeCounter = 0;
}

async function handleDecodeOutput(chunk: VideoFrame) {
  if (modeRef.value == 1) {
    encodeCtx.drawImage(
      chunk,
      Math.random() * 100 - 5,
      Math.random() * 100 - 5,
      Math.random() * width * 0.5 + width * 0.5,
      Math.random() * height * 0.5 + height * 0.5,
    );
  } else if (modeRef.value === 2) {
    encodeCtx.drawImage(
      chunk,
      (counter % modeInterval) * dir[0],
      (counter % modeInterval) * dir[1],
    );
  } else {
    encodeCtx.drawImage(chunk, 0, 0);
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
  for (let encoder of encoders) {
    if (encoder.encoder.state === "configured") encoder.encoder.close();
  }

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

let exportBuffer: string[] = [];
let dhandle;

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

    if (targetEncoder.encoder.state !== "configured") {
      videoFrame.close();
      return;
    }

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

  let exportCounter = 0;

  async function update() {
    if (stopRenderFlagRef.value) return;

    if (requestResetFlagRef.value) {
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);

      requestResetFlagRef.value = false;
      forceKeyFlagRef.value = true;
    }

    modeCounter++;

    // update mode
    if (modeCounter > modeInterval) {
      // ランダムにモードを決定
      modeRef.value =
        Math.random() < modeProbabilityRef.value
          ? Math.floor(Math.random() * 3)
          : 0;
      updateMode();
    }

    // 60 fps
    if (updateCounter % Math.floor(60 / fpsRef.value) === 0) {
      await reader();
    }

    // export
    if (exportFlagRef.value) {
      exportCounter++;
      console.log(exportCounter);
      const id = exportCounter;

      await new Promise((resolve) => {
        encodedRef.value!.toBlob(async function (result) {
          // @ts-ignore
          let fhandle = await dhandle.getFileHandle(
            `export_${id.toString().padStart(5, "0")}.png`,
            {
              create: true,
            },
          );
          const writable = await fhandle.createWritable();
          await writable.write(result);
          await writable.close();
          resolve(true);
        });
      });

      exportCounterRef.value = exportCounter;
    }

    const current = performance.now();

    updateCounter++;

    if (exportFlagRef.value) {
      setTimeout(update, 1000 / 60 - (current - lastUpdated));
      // update();
    } else {
      // update();

      if (codecStringRef.value === "vp8") {
        setTimeout(update, 1000 / 60 - (current - lastUpdated));
      } else if (codecStringRef.value === "avc1.4d002a") {
        update();
      } else {
        setTimeout(update, 5);
      }
    }
    lastUpdated = current;
  }

  // start
  update();
}

async function exportBufferToFiles() {
  console.log("exportBufferToFiles", exportBuffer.length);

  console.log("ファイル名インクリメントして保存");
  dhandle = await window.showDirectoryPicker();
  await dhandle.requestPermission({ writable: true });

  // for (let i = 0; i < exportBuffer.length; i++) {
  //   const a = document.createElement("a");
  //   a.href = exportBuffer[i];
  //   a.download = `export_${i.toString().padStart(5, "0")}.png`;
  //   a.click();
  //
  //   await new Promise((resolve) => setTimeout(resolve, 100));
  // }
}

function presetVP8() {
  encoderNumRef.value = 8;
  codecStringRef.value = "vp8";
  fpsRef.value = 30;
  requestResetFlagRef.value = true;
}

function presetVP8Fix() {
  redrawNoise();
  encoderNumRef.value = 8;
  codecStringRef.value = "vp8";
  fpsRef.value = 30;
  requestResetFlagRef.value = true;
}

function presetAVC() {
  codecStringRef.value = "avc1.4d002a";
  encoderNumRef.value = 5;
  fpsRef.value = 60;
  requestResetFlagRef.value = true;
}

function presetFixAVC() {
  codecStringRef.value = "avc1.4d002a";
  encoderNumRef.value = 5;
  modeProbabilityRef.value = 0;
  fpsRef.value = 60;
  requestResetFlagRef.value = true;
}

function presetFixAVCMono() {
  redrawNoise();
  codecStringRef.value = "avc1.4d002a";
  encoderNumRef.value = 5;
  modeProbabilityRef.value = 0;
  fpsRef.value = 60;
  requestResetFlagRef.value = true;
}

function presetVP9() {
  encoderNumRef.value = 2;
  codecStringRef.value = "vp09.00.10.10.01.09.16.09.01";
  requestResetFlagRef.value = true;
  fpsRef.value = 60;
}

function presetAV1() {
  codecStringRef.value = "av01.0.04M.10.0.110.09.16.09.0";
  encoderNumRef.value = 2;
  requestResetFlagRef.value = true;
  fpsRef.value = 60;
}

function presetAV1Mono() {
  redrawNoise();
  codecStringRef.value = "av01.0.04M.10.0.110.09.16.09.0";
  encoderNumRef.value = 2;
  requestResetFlagRef.value = true;
  fpsRef.value = 60;
}

function redrawNoise() {
  drawNoiseToCanvas(encodeCtx);
}

function drawFile(event: Event) {
  const file = (event.target as HTMLInputElement).files![0];
  drawImageToCanvas(encodeCtx, URL.createObjectURL(file));
  drawImageToCanvas(encodeCtx, URL.createObjectURL(file));
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
        <div>
          <h3>codec selector</h3>
          <button @click="presetVP8">vp8</button>
          <button @click="presetVP9">vp9</button>
          <button @click="presetAV1">av1</button>
          <button @click="presetAVC">avc</button>
        </div>

        <div>
          <h3>presets</h3>
          <button @click="presetFixAVC">fixavc</button>
          <button @click="presetFixAVCMono">fixavcmono</button>
          <button @click="presetVP8Fix">fixvp8mono</button>
          <button @click="presetAV1Mono">fixav1mono</button>
        </div>
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
        <label for="mode">mode</label>
        <input
          name="mode"
          type="number"
          min="0"
          max="2"
          step="1"
          :value="modeRef"
          @input="updateMode"
        />
      </div>
      <div>
        <label for="mode">mode</label>
        <input name="mode" type="file" @change="drawFile" accept="image/*" />
      </div>
      <hr />
      <div>
        <label for="codecString">codecString</label>
        <input name="codecString" type="text" v-model="codecStringRef" />
      </div>
      <div>
        <label for="encoderNum">encoderNum</label>
        <input name="encoderNum" type="number" v-model="encoderNumRef" />
      </div>
    </div>
    <div>
      <div>
        <label for="fps">fps</label>
        <input name="fps" type="number" v-model="fpsRef" />
      </div>
      <div>
        <label for="forceKeyFlag">forceKeyFlag</label>

        <input name="forceKeyFlag" type="checkbox" v-model="forceKeyFlagRef" />
      </div>
      <hr />
      <div>
        <label for="notimeUpdateFlag">notimeUpdateFlag</label>
        <input
          name="notimeUpdateFlag"
          type="checkbox"
          v-model="notimeUpdateFlagRef"
        />
      </div>
      <div>
        <label for="stopRenderFlag">stopRenderFlag</label>
        <input
          name="stopRenderFlag"
          type="checkbox"
          v-model="stopRenderFlagRef"
        />
      </div>
      <div class="export-section" v-if="exportEanbledRef">
        <div>
          <label for="exportFlag">exportFlag</label>

          <input name="exportFlag" type="checkbox" v-model="exportFlagRef" />
        </div>
        <div>
          <label for="exportCounter">exportCounter</label>

          <input
            name="exportCounter"
            type="number"
            v-model="exportCounterRef"
          />
        </div>
        <div>
          <button @click="exportBufferToFiles">exportBufferToFiles</button>
        </div>
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
  justify-content: space-around;
  width: 100%;
}

canvas {
  width: 432px;
  height: 432px;
  border: none;
}
</style>
