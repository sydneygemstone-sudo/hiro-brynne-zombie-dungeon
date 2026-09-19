import * as THREE from './three.module.js';

// Helper to create 16x16 pixel textures
function createPixelTexture(drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, 16, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

// Random noise helper
function noise(val, variance) {
  return Math.max(0, Math.min(255, Math.floor(val + (Math.random() * 2 - 1) * variance)));
}

// Cobblestone
export const cobblestoneTexture = createPixelTexture((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Mortar borders
      const isEdge = (x % 4 === 0 && (y % 4 !== 0)) || (y % 4 === 0);
      const base = isEdge ? 60 : 120;
      const gray = noise(base, 25);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

// Mossy Cobblestone
export const mossyStoneTexture = createPixelTexture((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isEdge = (x % 4 === 0 && (y % 4 !== 0)) || (y % 4 === 0);
      const isMoss = Math.random() < 0.28;
      if (isMoss) {
        const g = noise(130, 30);
        const r = noise(50, 15);
        ctx.fillStyle = `rgb(${r}, ${g}, 45)`;
      } else {
        const base = isEdge ? 60 : 110;
        const gray = noise(base, 20);
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

// Stone Brick Floor
export const floorTexture = createPixelTexture((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isLine = (y % 4 === 0) || ((y < 4 || (y >= 8 && y < 12)) ? x % 8 === 0 : (x + 4) % 8 === 0);
      const base = isLine ? 45 : 95;
      const g = noise(base, 15);
      ctx.fillStyle = `rgb(${g}, ${g}, ${Math.min(255, g + 8)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

// Ceiling Texture
export const ceilingTexture = createPixelTexture((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = noise(40, 12);
      ctx.fillStyle = `rgb(${g}, ${g}, ${g})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

// Gold Block / Treasure
export const goldTexture = createPixelTexture((ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBorder = x === 0 || x === 15 || y === 0 || y === 15;
      if (isBorder) {
        ctx.fillStyle = '#b8860b';
      } else {
        const isSparkle = (x === 4 && y === 4) || (x === 11 && y === 11);
        if (isSparkle) {
          ctx.fillStyle = '#ffffe0';
        } else {
          const r = noise(255, 10);
          const g = noise(215, 20);
          ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
        }
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
});

// Torch flame texture
export const torchTexture = createPixelTexture((ctx, w, h) => {
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(6, 4, 4, 12); // stick
  ctx.fillStyle = '#ff4500';
  ctx.fillRect(5, 0, 6, 6); // outer flame
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(6, 1, 4, 4); // inner flame
});

// Diamond Sword pixel texture
export const swordTexture = createPixelTexture((ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  // Diamond blade
  ctx.fillStyle = '#2de2e6';
  ctx.fillRect(9, 1, 4, 4);
  ctx.fillRect(7, 3, 4, 4);
  ctx.fillRect(5, 5, 4, 4);
  ctx.fillRect(3, 7, 4, 4);
  // Guard
  ctx.fillStyle = '#4a2c11';
  ctx.fillRect(1, 10, 4, 2);
  ctx.fillRect(6, 6, 2, 4);
  // Hilt
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(1, 12, 3, 3);
});

// Bandage pixel texture
export const bandageTexture = createPixelTexture((ctx, w, h) => {
  ctx.fillStyle = '#f0e6d2';
  ctx.fillRect(2, 2, 12, 12);
  ctx.fillStyle = '#d32f2f'; // Red cross
  ctx.fillRect(6, 4, 4, 8);
  ctx.fillRect(4, 6, 8, 4);
  ctx.fillStyle = '#c7b299';
  ctx.strokeRect(2.5, 2.5, 11, 11);
});

// Hero Face (Steve)
export const heroFaceTexture = createPixelTexture((ctx, w, h) => {
  ctx.fillStyle = '#c68642'; // skin
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4a2912'; // brown hair
  ctx.fillRect(0, 0, 16, 5);
  ctx.fillRect(0, 5, 2, 3);
  ctx.fillRect(14, 5, 2, 3);
  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 7, 3, 2);
  ctx.fillRect(10, 7, 3, 2);
  ctx.fillStyle = '#2b3ea0'; // Blue pupils
  ctx.fillRect(4, 7, 2, 2);
  ctx.fillRect(10, 7, 2, 2);
  // Nose / mouth
  ctx.fillStyle = '#9e5a22';
  ctx.fillRect(6, 9, 4, 2);
  ctx.fillStyle = '#613318'; // goatee
  ctx.fillRect(5, 11, 6, 2);
});

// Brian Face (Herobrine: Steve with glowing pure white eyes!)
export const brianFaceTexture = createPixelTexture((ctx, w, h) => {
  ctx.fillStyle = '#c68642'; // skin
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#30180a'; // dark brown hair
  ctx.fillRect(0, 0, 16, 5);
  ctx.fillRect(0, 5, 2, 3);
  ctx.fillRect(14, 5, 2, 3);
  // Pure glowing white eyes (NO pupils!)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 7, 4, 3);
  ctx.fillRect(9, 7, 4, 3);
  // Nose / mouth
  ctx.fillStyle = '#9e5a22';
  ctx.fillRect(6, 9, 4, 2);
  ctx.fillStyle = '#613318';
  ctx.fillRect(5, 11, 6, 2);
});

// Zombie Face
export const zombieFaceTexture = createPixelTexture((ctx, w, h) => {
  ctx.fillStyle = '#567d46'; // Rotten green skin
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2d4522'; // Dark green hair
  ctx.fillRect(0, 0, 16, 5);
  ctx.fillRect(0, 5, 2, 3);
  ctx.fillRect(14, 5, 2, 3);
  // Black zombie eye sockets
  ctx.fillStyle = '#111f0e';
  ctx.fillRect(3, 7, 3, 2);
  ctx.fillRect(10, 7, 3, 2);
  // Dark nose & mouth
  ctx.fillStyle = '#1e3015';
  ctx.fillRect(6, 9, 4, 2);
  ctx.fillRect(5, 11, 6, 2);
});
