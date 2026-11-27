import * as THREE from 'three';
import { configureTombPs2Texture, seededTombRandom } from './ps2Utils';

export type TombGlyphKind = 'sun' | 'scarab' | 'serpent' | 'aytham';

export interface TombTextureLibrary {
  hieroglyphWall: THREE.CanvasTexture;
  tombFloor: THREE.CanvasTexture;
  crackedWall: THREE.CanvasTexture;
  glyphs: Record<TombGlyphKind, THREE.CanvasTexture>;
  dispose: () => void;
}

function drawGlyphIcon(
  ctx: CanvasRenderingContext2D,
  kind: TombGlyphKind,
  gold = '#f0be4d',
  accent = '#35d0be'
): void {
  // Weathered dark sandstone tablet backdrop
  ctx.fillStyle = '#3c2a1a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#9c7442';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 56, 56);
  ctx.strokeStyle = '#24160c';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 48, 48);

  ctx.fillStyle = gold;
  ctx.strokeStyle = gold;

  if (kind === 'sun') {
    // Solar disc with cardinal rays
    ctx.beginPath();
    ctx.arc(32, 32, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c3c1e';
    ctx.beginPath();
    ctx.arc(32, 32, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14);
      ctx.lineTo(32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21);
      ctx.stroke();
    }
  } else if (kind === 'scarab') {
    // Stylized low-poly sacred scarab beetle
    ctx.fillStyle = accent;
    ctx.fillRect(22, 22, 20, 24);
    ctx.fillStyle = gold;
    ctx.fillRect(25, 14, 14, 9);
    ctx.fillRect(30, 24, 4, 22);
    ctx.lineWidth = 3;
    // Legs
    [26, 34, 42].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(22, y);
      ctx.lineTo(13, y - 3);
      ctx.moveTo(42, y);
      ctx.lineTo(51, y - 3);
      ctx.stroke();
    });
  } else if (kind === 'serpent') {
    // Sinuous cobra wave glyph
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(16, 48);
    ctx.lineTo(44, 42);
    ctx.lineTo(20, 32);
    ctx.lineTo(44, 22);
    ctx.lineTo(28, 14);
    ctx.stroke();
    ctx.fillStyle = '#d9483b';
    ctx.fillRect(22, 11, 8, 6);
  } else {
    // Ancient Tamil ஃ Aytham three-dot emblem
    const dots: [number, number][] = [
      [32, 19],
      [20, 42],
      [44, 42],
    ];
    dots.forEach(([dx, dy]) => {
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.arc(dx, dy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff1b8';
      ctx.fillRect(dx - 2, dy - 2, 4, 4);
    });
  }
}

export function createTombTextures(): TombTextureLibrary {
  const rand = seededTombRandom(8842);

  // 1. Carved Hieroglyphic Tomb Sandstone Wall (64x64)
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 64;
  hCanvas.height = 64;
  const hctx = hCanvas.getContext('2d')!;
  hctx.fillStyle = '#8b653c';
  hctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = (rand() - 0.5) * 18;
      hctx.fillStyle = `rgb(${(134 + n) | 0},${(98 + n * 0.8) | 0},${(58 + n * 0.6) | 0})`;
      hctx.fillRect(x, y, 1, 1);
    }
  }
  // Stone courses & carved frieze band
  hctx.fillStyle = '#4e351e';
  hctx.fillRect(0, 14, 64, 2);
  hctx.fillRect(0, 46, 64, 2);
  hctx.fillRect(31, 0, 2, 14);
  hctx.fillRect(15, 48, 2, 16);
  hctx.fillRect(47, 48, 2, 16);
  // Stylized gold/ochre hieroglyphic reliefs in the middle band (y: 18..44)
  hctx.fillStyle = '#d49e46';
  // Ankh
  hctx.fillRect(9, 21, 5, 5);
  hctx.fillRect(11, 26, 2, 13);
  hctx.fillRect(7, 29, 9, 2);
  // Eye + sun
  hctx.fillRect(24, 24, 12, 6);
  hctx.fillStyle = '#43b3a4';
  hctx.fillRect(28, 25, 4, 4);
  // Staff + serpent
  hctx.fillStyle = '#d49e46';
  hctx.fillRect(46, 20, 2, 20);
  hctx.fillRect(42, 22, 8, 2);
  hctx.fillRect(54, 25, 3, 12);
  hctx.fillRect(51, 31, 6, 2);
  const hieroglyphWall = configureTombPs2Texture(hCanvas, 2, 1);

  // 2. Dark Tomb Cut Flagstone Floor (64x64)
  const fCanvas = document.createElement('canvas');
  fCanvas.width = 64;
  fCanvas.height = 64;
  const fctx = fCanvas.getContext('2d')!;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const dust = (rand() - 0.5) * 16;
      fctx.fillStyle = `rgb(${(106 + dust) | 0},${(78 + dust * 0.8) | 0},${(48 + dust * 0.6) | 0})`;
      fctx.fillRect(x, y, 1, 1);
    }
  }
  fctx.fillStyle = '#3c2919';
  for (let i = 0; i < 64; i += 16) {
    fctx.fillRect(0, i, 64, 2);
    fctx.fillRect(i, 0, 2, 64);
  }
  const tombFloor = configureTombPs2Texture(fCanvas, 2, 2);

  // 3. Cracked False Wall (hints at hidden passage)
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 64;
  cCanvas.height = 64;
  const cctx = cCanvas.getContext('2d')!;
  cctx.drawImage(hCanvas, 0, 0);
  cctx.strokeStyle = '#1b1109';
  cctx.lineWidth = 3;
  cctx.beginPath();
  cctx.moveTo(32, 4);
  cctx.lineTo(26, 20);
  cctx.lineTo(38, 34);
  cctx.lineTo(24, 52);
  cctx.lineTo(31, 62);
  cctx.stroke();
  cctx.strokeStyle = '#4ad1be';
  cctx.lineWidth = 1;
  cctx.beginPath();
  cctx.moveTo(33, 6);
  cctx.lineTo(27, 21);
  cctx.lineTo(39, 34);
  cctx.stroke();
  const crackedWall = configureTombPs2Texture(cCanvas, 1, 1);

  // 4. Four Rotating Disc Symbol Textures
  const glyphKinds: TombGlyphKind[] = ['sun', 'scarab', 'serpent', 'aytham'];
  const glyphs = {} as Record<TombGlyphKind, THREE.CanvasTexture>;
  glyphKinds.forEach((k) => {
    const gc = document.createElement('canvas');
    gc.width = 64;
    gc.height = 64;
    drawGlyphIcon(gc.getContext('2d')!, k);
    glyphs[k] = configureTombPs2Texture(gc, 1, 1);
  });

  return {
    hieroglyphWall,
    tombFloor,
    crackedWall,
    glyphs,
    dispose: () => {
      hieroglyphWall.dispose();
      tombFloor.dispose();
      crackedWall.dispose();
      glyphKinds.forEach((k) => glyphs[k].dispose());
    },
  };
}
