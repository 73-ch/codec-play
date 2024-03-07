<script setup lang="ts">
import { onMounted, ref } from "vue";
import { drawImageToCanvas, drawNoiseToCanvas } from "./assets/CanvasUtils.ts";
import CheckCodecSupport from "./components/CheckCodecSupport.vue";
import HowToUse from "./components/HowToUse.vue";

// export
const urlParams = new URLSearchParams(window.location.search);
const exportEnabledRef = ref<boolean>(urlParams.has("export"));

const encodedRef = ref<HTMLCanvasElement>();

const transformTransitionRate = ref<number>(0.05);

const widthRef = ref<number>(864);
const heightRef = ref<number>(864);

const encoderNumRef = ref<number>(2);
const codecStringRef = ref<string>("av01.0.04M.10.0.110.09.16.09.0");

const codecs = ref([
  { text: "av1", value: "av01.0.04M.10.0.110.09.16.09.0" },
  { text: "avc", value: "avc1.4d003d" },
  { text: "vp8", value: "vp8" },
  { text: "vp9", value: "vp09.00.10.10.01.09.16.09.01" },
]);

const exportCounterRef = ref<number>(0);

const fpsRef = ref<number>(60);

// encode canvas setup
let encodeCtx: CanvasRenderingContext2D;

let exportFlagRef = ref<boolean>(false);
let forceKeyFlagRef = ref<boolean>(false);

let requestResetFlagRef = ref<boolean>(false);

let pauseRenderFlag = ref<boolean>(false);

let decoder: VideoDecoder;
const encoders: { encoder: VideoEncoder; counter: number }[] = [];

let counter = 0;
const modeRef = ref<number>(0);
let dir: number[] = [0, 0];
let modeInterval = 30;
let modeCounter = 0;

function updateMode(event?: Event) {
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
      Math.random() * widthRef.value * 0.5 + widthRef.value * 0.5,
      Math.random() * heightRef.value * 0.5 + heightRef.value * 0.5,
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
      width: widthRef.value,
      height: heightRef.value,
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
let dhandle: any;
const isStarted = ref<boolean>(false);

onMounted(async () => {
  encodeCtx = encodedRef.value!.getContext("2d", {
    willReadFrequently: true,
  })!;

  encodeCtx.fillRect(0, 0, widthRef.value, heightRef.value);

  document.body.addEventListener("keydown", (ev) => {
    console.log("key down");
    if (ev.key === "1") {
      presetVP8();
    } else if (ev.key === "2") {
      presetAVC();
    } else if (ev.key === "3") {
      redrawNoise();
    }
  });
});

async function start() {
  isStarted.value = true;

  // await drawImageToCanvas(encodeCtx, "/noise.png");
  if (fileUrl) {
    drawImageToCanvas(encodeCtx, fileUrl);
  } else {
    drawNoiseToCanvas(encodeCtx);
  }

  const stream = encodedRef.value!.captureStream(30);
  const [videoTrack] = stream.getVideoTracks();
  createDecoder(codecStringRef.value);
  createEncoders(codecStringRef.value);

  const reader = async () => {
    if (pauseRenderFlag.value) return;

    // @ts-ignore
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
    if (pauseRenderFlag.value) return;

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
        Math.random() < transformTransitionRate.value
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
      update();

      // if (codecStringRef.value === "vp8") {
      //   // setTimeout(update, 1000 / 60 - (current - lastUpdated));
      // } else if (codecStringRef.value === "avc1.4d003d") {
      //   update();
      // } else {
      //   setTimeout(update, 5);
      // }
    }
    lastUpdated = current;
  }

  // start
  update();
}

async function exportBufferToFiles() {
  console.log("exportBufferToFiles", exportBuffer.length);

  console.log("ファイル名インクリメントして保存");
  // @ts-ignore
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
  codecStringRef.value = "avc1.4d003d";
  encoderNumRef.value = 5;
  fpsRef.value = 60;
  requestResetFlagRef.value = true;
}

function presetFixAVC() {
  codecStringRef.value = "avc1.4d003d";
  encoderNumRef.value = 5;
  transformTransitionRate.value = 0;
  fpsRef.value = 60;
  requestResetFlagRef.value = true;
}

function presetFixAVCMono() {
  redrawNoise();
  codecStringRef.value = "avc1.4d003d";
  encoderNumRef.value = 5;
  transformTransitionRate.value = 0;
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

let fileUrl = "";

function drawImage() {
  drawImageToCanvas(encodeCtx, fileUrl);
}

function drawFile(event: Event) {
  const file = (event.target as HTMLInputElement).files![0];
  fileUrl = URL.createObjectURL(file);
  drawImage();
}
</script>
<template>
  <check-codec-support />
  <section>
    <h1>Codec Play Maker(beta)</h1>
    <div id="caption">
      <p>
        <a href="https://github.com/73-ch/codec-play">GitHub</a> |
        <a href="https://73ch.work/">Kosaku Namikawa</a>
      </p>
    </div>
    <div>
      <div>
        <div>
          <span>
            <button @click="drawImage">Draw Image</button>

            <input
              id="imageInput"
              name="image"
              type="file"
              @change="drawFile"
              accept="image/*"
            />
          </span>
        </div>
        <div>
          <button @click="redrawNoise">Draw Noise</button>
        </div>
        <div>
          <button @click="start" :disabled="isStarted">start</button>
          <button @click="requestResetFlagRef = true">Reset Encoder</button>
          <how-to-use />
        </div>
      </div>
      <div>
        <div>
          <h3>codec preset selector</h3>
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
        <p>
          <label for="modeProbability">Transform Transition Rate </label>
          <input
            name="modeProbability"
            type="number"
            min="0"
            max="1"
            step="0.01"
            v-model="transformTransitionRate"
          />
        </p>
        <p>
          <label for="mode">mode </label>
          <input
            name="mode"
            type="number"
            min="0"
            max="2"
            step="1"
            :value="modeRef"
            @input="updateMode"
          />
        </p>
      </div>

      <div class="encoder-info">
        <p>
          <label for="codecString">codecString </label>
          <select name="codecs" id="codec" v-model="codecStringRef">
            <option v-for="codec in codecs" :value="codec.value">
              {{ codec.text }}
            </option>
          </select>
          <input
            id="codecStringInput"
            name="codecString"
            type="text"
            v-model="codecStringRef"
          />
        </p>
        <p>
          <label for="encoderNum">encoderNum </label>
          <input
            name="encoderNum"
            type="number"
            v-model="encoderNumRef"
            step="1"
            min="1"
            max="10"
          />
        </p>
      </div>
    </div>
    <div>
      <div>
        <p>
          <label for="width">width </label>
          <input
            name="width"
            type="number"
            v-model="widthRef"
            step="1"
            min="0"
            max="10000"
          />
          <label for="height">height </label>
          <input
            name="height"
            type="number"
            v-model="heightRef"
            step="1"
            min="0"
            max="10000"
          />
        </p>
        <p>
          <label for="fps">fps </label>
          <input
            name="fps"
            type="number"
            v-model="fpsRef"
            step="1"
            min="0"
            max="120"
          />
        </p>
        <p>
          <label for="forceKeyFlag">forceKeyFlag </label>

          <input
            name="forceKeyFlag"
            type="checkbox"
            v-model="forceKeyFlagRef"
          />
        </p>
      </div>
      <div>
        <p>
          <label for="stopRenderFlag">Pause Render </label>
          <input
            name="stopRenderFlag"
            type="checkbox"
            v-model="pauseRenderFlag"
          />
        </p>
      </div>
      <div class="export-section" v-if="exportEnabledRef">
        <div>
          <label for="exportFlag">exportFlag </label>

          <input name="exportFlag" type="checkbox" v-model="exportFlagRef" />
        </div>
        <div>
          <label for="exportCounter">exportCounter </label>

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

  <canvas
    :width="widthRef"
    :height="heightRef"
    ref="encodedRef"
    :style="{ width: widthRef + 'px', height: heightRef + 'px' }"
  ></canvas>
</template>

<style scoped>
section {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

section div {
  padding: 0;
  margin: 0.25em;
}

#caption {
  padding-left: 1.5em;
}

#caption p {
  margin: 0;
}

#imageInput {
  width: 50%;
}

#codecStringInput {
  width: 16em;
}
</style>
