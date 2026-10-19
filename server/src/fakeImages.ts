import jpeg from "jpeg-js";

/** A real JPEG for tests: `seed` draws a different picture, `quality` saves the same one again differently. */
export function testJpeg(width: number, height: number, seed: number, quality = 90): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const wave = Math.sin(((x / width) * Math.cos(seed) + (y / height) * Math.sin(seed)) * 9 + seed);
      data[p] = 128 + 120 * wave;
      data[p + 1] = 128 + 100 * Math.sin((y / height) * 5 + seed * 2);
      data[p + 2] = 128 - 120 * wave;
      data[p + 3] = 255;
    }
  }
  return jpeg.encode({ data, width, height }, quality).data;
}
