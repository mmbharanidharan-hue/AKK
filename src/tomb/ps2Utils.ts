import * as THREE from 'three';

/**
 * Shared PS1/early-PS2 clip-space vertex wobble shader injection and texture helpers.
 */
export function applyTombPs2Wobble<T extends THREE.Material>(
  material: T,
  gridX = 250.0,
  gridY = 170.0
): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      #include <project_vertex>
      if (gl_Position.w > 0.08) {
        vec2 ps2Grid = vec2(${gridX.toFixed(1)}, ${gridY.toFixed(1)});
        gl_Position.xy = floor((gl_Position.xy / gl_Position.w) * ps2Grid + 0.5) / ps2Grid * gl_Position.w;
      }
      `
    );
  };
  material.customProgramCacheKey = () => `ps2-wobble-${gridX}-${gridY}`;
  return material;
}

export function configureTombPs2Texture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export function seededTombRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
