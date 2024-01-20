<script setup lang="ts">
import { ref } from "vue";

const encodedRef = ref<HTMLCanvasElement>();

const modeProbabilityRef = ref<number>(0.1);

const width = 864;
const height = 864;

const encoderNumRef = ref<number>(2);
const codecStringRef = ref<string>("av01.0.04M.10.0.110.09.16.09.0");

const fpsRef = ref<number>(60);

// encode canvas setup
let encodeCtx: CanvasRenderingContext2D;

let exportFlagRef = ref<boolean>(false);

const drawImageToCanvas = async () => {
  // noise image setup
  const image = new Image();
  image.src = "./noise.png";

  await new Promise((resolve) => {
    image.onload = () => {
      encodeCtx.drawImage(image, 0, 0);
      resolve(true);
    };
  });
};

const drawNoiseToCanvas = (color: boolean = false) => {
  const imgData = encodeCtx.getImageData(0, 0, width, height);
  const pix = imgData.data;
  const pixLen = pix.length;

  console.log(imgData);
  for (let pixel = 0; pixel < pixLen; pixel += 4) {
    const Y = Math.random() * 255;
    pix[pixel + 2] = color ? Math.random() * 255 : Y;
    pix[pixel + 1] = color ? Math.random() * 255 : Y;
    pix[pixel] = color ? Math.random() * 255 : Y;
  }
  encodeCtx.putImageData(imgData, 0, 0);
};

async function start() {
  console.log("mounted");
  encodeCtx = encodedRef.value!.getContext("2d", {
    willReadFrequently: true,
  })!;

  await drawImageToCanvas();
  drawNoiseToCanvas();

  const stream = encodedRef.value!.captureStream(30);
  const [videoTrack] = stream.getVideoTracks();

  let mode = 0;
  let dir: number[] = [0, 0];

  let interval = 30;

  async function handleDecodeOutput(chunk: VideoFrame) {
    // encodeCtx.clearRect(0, 0, width, height);
    // encodeCtx.globalAlpha = 0.1;
    // console.log("mode", mode);

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
        (counter % 100) * dir[0],
        (counter % 100) * dir[1],
      );
    } else {
      encodeCtx.drawImage(chunk, 0, 0);
    }

    // update mode
    if (counter % interval === 0 && Math.random() < modeProbabilityRef.value) {
      mode = Math.floor(Math.random() * 3);

      if (mode === 2) {
        dir = [
          Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
          Math.floor(Math.random() * 3 - 1) * 8 * Math.random(),
        ];

        dir[0] === 0 && dir[1] === 0 && (dir[0] = 8 * Math.random());
      }

      interval = Math.floor(Math.random() * 60) + 10;
    }

    if (counter % interval === interval - 1) {
      mode = 0;
    }

    chunk.close();
  }

  let decoder: VideoDecoder;

  function createDecoder(codecString: string) {
    decoder = new VideoDecoder({
      output: handleDecodeOutput,
      error: async function (e) {
        console.error(e);

        createDecoder(codecStringRef.value);

        forceKeyFrame = true;
        await decoder.flush();
      },
    });

    decoder.configure({
      codec: codecString,
      hardwareAcceleration: "prefer-software",
    });
  }

  createDecoder(codecStringRef.value);

  async function handleEncodeOutput(chunk: EncodedVideoChunk) {
    // consts.copyTo(data);

    // data[Math.floor(Math.random() * data.length)] = 0;

    // const modifiedChunk = new EncodedVideoChunk({
    //   timestamp: chunk.timestamp,
    //   duration: chunk.duration ? chunk.duration : 0,
    //   type: chunk.type,
    //   data: data,
    // });

    // chunk.
    try {
      decoder.decode(chunk);
    } catch (e) {
      forceKeyFrame = true;
    }
  }

  const encoders: { encoder: VideoEncoder; counter: number }[] = [];

  function createEncoders(codecString: string) {
    for (let i = 0; i < encoderNumRef.value; ++i) {
      const encoder = new VideoEncoder({
        output: handleEncodeOutput,
        error: function (e) {
          console.error(e, arguments);
          forceKeyFrame = true;
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

  createEncoders(codecStringRef.value);

  let counter = 0;
  let forceKeyFrame = false;

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
      keyFrame: forceKeyFrame || targetEncoder.counter % 30 === 0,
    });

    forceKeyFrame = false;

    targetEncoder.counter++;

    counter++;
    videoFrame.close();

    frameReader.releaseLock();
  };

  reader();

  let updateCounter = 0;

  let lastUpdated = performance.now();
  let exportCounter = 0;

  async function update() {
    // 60 fps
    if (updateCounter % Math.floor(60 / fpsRef.value) === 0) {
      await reader();
    }

    // export
    if (exportFlagRef.value) {
      console.log(exportCounter);
      exportCounter++;
      const url = encodedRef.value!.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${exportCounter.toString().padStart(5, "0")}.png`;
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

  update();

  // let intervalId = setInterval(update, 1000 / 60);

  window.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      update();
    } else if (e.key === "u") {
      // clearInterval(intervalId);
      fpsRef.value += 1;
      // intervalId = setInterval(reader, 1000 / ++fps);
      console.log("fps", fpsRef.value);
    } else if (e.key === "d") {
      fpsRef.value -= 1;
      // clearInterval(intervalId);
      // intervalId = setInterval(reader, 1000 / --fps);
      console.log("fps", fpsRef.value);
    } else if (e.key === "r") {
      drawNoiseToCanvas();
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);
    } else if (e.key === "e") {
      exportFlagRef.value = !exportFlagRef.value;
    }

    // codec select
    if (e.key === "1") {
      // vp09.02.10.10.01.09.16.09.01
      // vp8
      // avc1.4d002a
      encoderNumRef.value = 8;
      codecStringRef.value = "vp8";
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);
      forceKeyFrame = true;
      fpsRef.value = 10;
    } else if (e.key === "2") {
      codecStringRef.value = "avc1.4d002a";
      encoderNumRef.value = 5;
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);
      forceKeyFrame = true;
    } else if (e.key === "3") {
      encoderNumRef.value = 2;
      codecStringRef.value = "vp09.02.10.10.01.09.16.09.01";
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);

      forceKeyFrame = true;
    } else if (e.key === "4") {
      codecStringRef.value = "av01.0.04M.10.0.110.09.16.09.0";
      encoderNumRef.value = 2;
      createEncoders(codecStringRef.value);
      createDecoder(codecStringRef.value);

      forceKeyFrame = true;
    }
  });
}
</script>
<template>
  <button @click="start">start</button>
  <div>
    <div>
      <label for="modeProbability">modeProbability</label>
      <input
        name="modeProbability"
        type="number"
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
      <label for="exportFlag">exportFlag</label>

      <input name="exportFlag" type="checkbox" v-model="exportFlagRef" />
    </div>
  </div>

  <canvas width="864" height="864" ref="encodedRef"></canvas>
</template>

<style scoped>
canvas {
  width: 864px;
  height: 864px;
  border: none;
}
</style>
