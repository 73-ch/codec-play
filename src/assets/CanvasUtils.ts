export const drawImageToCanvas = async (
  ctx: CanvasRenderingContext2D,
  src: string,
) => {
  // noise image setup
  const image = new Image();
  image.src = src;

  await new Promise((resolve) => {
    image.onload = () => {
      ctx.drawImage(image, 0, 0);
      resolve(true);
    };
  });
};

export const drawNoiseToCanvas = (
  ctx: CanvasRenderingContext2D,
  color: boolean = false,
) => {
  const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pix = imgData.data;
  const pixLen = pix.length;

  for (let pixel = 0; pixel < pixLen; pixel += 4) {
    const Y = Math.random() * 255;
    pix[pixel + 3] = 255;
    pix[pixel + 2] = color ? Math.random() * 255 : Y;
    pix[pixel + 1] = color ? Math.random() * 255 : Y;
    pix[pixel] = color ? Math.random() * 255 : Y;
  }
  ctx.putImageData(imgData, 0, 0);
};
