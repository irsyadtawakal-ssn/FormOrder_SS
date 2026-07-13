const Jimp = require('jimp');

const url = 'https://lh3.googleusercontent.com/aida/AP1WRLtIynO5rF18aXcC1CIAac8MJnAqj8eIIfBqJRruGLQHZ_R8hiiyXGVgFfwbNNaTK_VDO5sSUyBXfSG_VOaZdS-dxqxRH3mPprppCWyxSMe3IZz06P1W_NMPIIS0WHRpNe3tO6173eh7y4jRweuBFdsWZkdWXmJqgEzA-tw6LANGIgpQJ-YrOZJT-lwU_S-O7rM8D-P8-s-xAkt01EdGN8S-l1yvpAqaDKjioDe5moQEgmaYWaAHmy5BTQ';

function isGrayscale(r, g, b, threshold = 20) {
  return Math.abs(r - g) < threshold && Math.abs(g - b) < threshold && Math.abs(r - b) < threshold;
}

function isLightOrDark(r, g, b) {
  const avg = (r + g + b) / 3;
  return avg < 30 || avg > 225;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

Jimp.read(url)
  .then(img => {
    img.resize(250, Jimp.AUTO);
    const colors = {};
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      if (!isGrayscale(r, g, b) && !isLightOrDark(r, g, b)) {
        const rr = Math.round(r / 15) * 15;
        const gg = Math.round(g / 15) * 15;
        const bb = Math.round(b / 15) * 15;
        const key = rgbToHex(rr, gg, bb);
        colors[key] = (colors[key] || 0) + 1;
      }
    });
    const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(sorted);
  })
  .catch(err => {
    console.error(err);
  });
