/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ============================================================================
 * AKK (Phase 2: Combat & First Enemy)
 * Modular Three.js PS2-Era Low-Poly 3D Action-Adventure
 * ============================================================================
 *
 * MODULE INDEX
 * ----------------------------------------------------------------------------
 * 1. CONFIG, PALETTE & SHARED TYPES
 * 2. PS2 RENDERING UTILITIES & PROCEDURAL LOW-RES TEXTURES
 * 3. AUDIO MODULE (BGM Loop + Procedural Web Audio SFX)
 * 4. WORLD MODULE (Desert Dunes, Ruins, Aytham Motifs, Distant Pyramid, Lighting)
 * 5. PLAYER MODULE (Low-Poly Tamil Explorer, Vel & Kedayam, Vitals, Animations)
 * 5B. ENEMY MODULE (EnemySystem — 3 Low-Poly Cursed Mummies)
 * 5C. COMBAT MODULE (CombatSystem — Spear Hitbox, Shield Block, Dodge I-Frames)
 * 6. CAMERA MODULE (Third-Person Orbit Camera + Wall/Terrain Collision + Shake)
 * 7. UI SUB-COMPONENTS (AKK ஃ Logo, HUD Vitals, Game Over)
 * 8. GAME ENGINE (Input, Fixed-Safe Loop, Software-WebGL Guard, Lifecycle)
 * ============================================================================
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  TombSystem,
  TombHudState,
  BossHudSnapshot,
  tombGroundHeightAt,
} from './tomb/TombSystem';

/* ============================================================================
 * 1. CONFIG, PALETTE & SHARED TYPES
 * ==========================================================================*/

const BGM_URL = '/assets/aistudio/aggu_bgm_b9001466.mp3';

const CONFIG = {
  /** Target internal vertical resolution for authentic PS2 pixelated upscale */
  PS2_INTERNAL_HEIGHT: 320,
  /** Playable desert radius before natural dune ridges gently turn the explorer back */
  WORLD_PLAY_RADIUS: 66,
  /** Default low background music volume */
  DEFAULT_BGM_VOLUME: 0.26,
  /** Physics & Movement */
  GRAVITY: -24.0,
  WALK_SPEED: 5.2,
  SPRINT_SPEED: 9.2,
  SNEAK_SPEED: 2.4,
  BLOCK_SPEED: 2.7,
  DODGE_SPEED: 12.6,
  DODGE_DURATION: 0.42,
  DODGE_COOLDOWN: 0.65,
  JUMP_VELOCITY: 9.4,
  COYOTE_TIME: 0.12,
  JUMP_BUFFER_TIME: 0.12,
  ATTACK_DURATION: 0.38,
  ATTACK_COOLDOWN: 0.52,
  /** Player Vitals & Stamina */
  PLAYER_MAX_HEALTH: 100,
  PLAYER_MAX_STAMINA: 100,
  STAMINA_REGEN_IDLE: 24,
  STAMINA_REGEN_WALK: 8,
  STAMINA_REGEN_DELAY: 0.55,
  SPRINT_STAMINA_DRAIN: 18,
  ATTACK_STAMINA_COST: 16,
  DODGE_STAMINA_COST: 24,
  BLOCK_STAMINA_COST: 15,
  /** Combat */
  SPEAR_DAMAGE: 28,
  SPEAR_RANGE: 2.65,
  SPEAR_HIT_RADIUS: 1.1,
  ATTACK_HIT_START: 0.22,
  ATTACK_HIT_END: 0.68,
  BLOCK_DAMAGE_MULT: 0.2, // Cuts incoming damage by 80%
  DODGE_INVULN_DURATION: 0.34,
  HIT_FLASH_DURATION: 0.14,
  CAM_SHAKE_LIGHT: 0.14,
  CAM_SHAKE_HEAVY: 0.32,
  /** Cursed Mummy Enemy */
  MUMMY_MAX_HEALTH: 75,
  MUMMY_DAMAGE: 22,
  MUMMY_MOVE_SPEED: 2.55,
  MUMMY_WANDER_SPEED: 1.15,
  MUMMY_DETECT_RANGE: 14.5,
  MUMMY_LOSE_RANGE: 22.0,
  MUMMY_ATTACK_RANGE: 2.15,
  MUMMY_ATTACK_WINDUP: 0.56,
  MUMMY_ATTACK_DURATION: 0.95,
  MUMMY_ATTACK_COOLDOWN: 1.55,
  MUMMY_KNOCKBACK_SPEED: 5.8,
  MUMMY_COLLIDER_RADIUS: 0.48,
  MUMMY_SPAWNS: [
    { x: -10.5, z: -10.5 },
    { x: 10.5, z: -11.0 },
    { x: -3.5, z: -25.0 },
  ],
  MUMMY_PATROLS: [
    [
      { x: -10.5, z: -10.5 },
      { x: -12.5, z: -20.5 },
    ],
    [
      { x: 10.5, z: -11.0 },
      { x: 13.5, z: -21.5 },
    ],
    [
      { x: -4.0, z: -25.0 },
      { x: 5.5, z: -25.5 },
    ],
  ],
  /** Stealth & Detection */
  STEALTH_VISION_RANGE: 15.5,
  STEALTH_VISION_ANGLE_DEG: 90,
  STEALTH_HEARING_RADIUS: 4.2,
  STEALTH_SNEAK_DETECT_MULT: 0.4,
  STEALTH_SNEAK_NOISE_MULT: 0.25,
  STEALTH_SPRINT_DETECT_MULT: 1.45,
  STEALTH_SPRINT_NOISE_MULT: 1.6,
  STEALTH_SHADOW_VISIBILITY_MULT: 0.48,
  STEALTH_SHADOW_SNEAK_MULT: 0.24,
  STEALTH_DETECT_BUILD_RATE: 0.95,
  STEALTH_DETECT_DRAIN_RATE: 0.42,
  STEALTH_SUSPICIOUS_THRESHOLD: 0.3,
  STEALTH_ALERT_THRESHOLD: 1.0,
  STEALTH_SEARCH_DURATION: 4.8,
  STEALTH_ALERT_LOSE_DELAY: 1.6,
  STEALTH_TAKEDOWN_RANGE: 2.55,
  STEALTH_TAKEDOWN_BEHIND_DOT: -0.1,
  STEALTH_TAKEDOWN_DURATION: 0.5,
  /** Camera */
  CAM_DEFAULT_DIST: 5.5,
  CAM_SPRINT_DIST: 6.1,
  CAM_BLOCK_DIST: 4.6,
  CAM_MIN_DIST: 1.45,
  CAM_PITCH_MIN: -0.32,
  CAM_PITCH_MAX: 1.05,
  CAM_SENSITIVITY: 0.0024,
} as const;

const PALETTE = {
  SKY_HORIZON: 0xd89d54,
  SKY_MID: 0xc57d44,
  SKY_ZENITH: 0x2c4a6e,
  FOG_COLOR: 0xd89d54,
  SUN_LIGHT: 0xffd084,
  HEMI_SKY: 0x8db6de,
  HEMI_GROUND: 0x8c5326,
  RIM_LIGHT: 0xf4a454,
  SAND_LIGHT: 0xdba558,
  SAND_DARK: 0xb67a38,
  SANDSTONE: 0xc99654,
  SANDSTONE_DARK: 0x9b6e39,
  GOLD: 0xe6b446,
  BRONZE: 0xa67332,
  CRIMSON: 0x9e1d1d,
  VESHTI_CREAM: 0xefe3c6,
  SKIN_BRONZE: 0x9c5f3a,
  LEATHER: 0x4e2d18,
  HAIR_DARK: 0x1a1310,
  AYTHAM_GLOW: 0xffc84d,
} as const;

type GamePhase = 'title' | 'playing' | 'paused' | 'gameover' | 'victory';
type PlayerStance =
  | 'IDLE'
  | 'WALK'
  | 'SPRINT'
  | 'SNEAK'
  | 'AIR'
  | 'ATTACK'
  | 'BLOCK'
  | 'DODGE';

interface CylinderCollider {
  type: 'cylinder';
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

interface BoxCollider {
  type: 'box';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

type WorldCollider = CylinderCollider | BoxCollider;

interface InteractableLandmark {
  id: string;
  label: string;
  title: string;
  inscription: string;
  position: THREE.Vector3;
  radius: number;
  accentMesh?: THREE.Mesh;
}

interface ShadowZone {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

type StealthStatus = 'hidden' | 'unseen' | 'suspicious' | 'alert';

interface StealthHudState {
  level: number;
  status: StealthStatus;
  inShadow: boolean;
  canTakedown: boolean;
}

interface HudSnapshot {
  stance: PlayerStance;
  headingDeg: number;
  nearLandmark: { label: string; title: string } | null;
  pointerLocked: boolean;
  health: number;
  stamina: number;
  stealth: StealthHudState;
  realm: 'desert' | 'tomb';
  tomb: TombHudState;
  boss: BossHudSnapshot;
}

/* Pre-allocated scratch math helpers to avoid per-frame GC churn */
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _v3d = new THREE.Vector3();
const _camRayDir = new THREE.Vector3();
const _camOrigin = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camSide = new THREE.Vector3();

/* ============================================================================
 * 2. PS2 RENDERING UTILITIES & PROCEDURAL LOW-RES TEXTURES
 * ==========================================================================*/

/**
 * Detects software WebGL renderers (SwiftShader, llvmpipe, WARP) to pace
 * continuous render loops safely without changing scene content or layout.
 */
function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

/**
 * Injects subtle PS1/early-PS2 clip-space vertex snapping ("vertex wobble")
 * into any Three.js MeshStandardMaterial while preserving PBR lighting,
 * shadows, flat shading, and fog.
 */
function applyPs2VertexWobble<T extends THREE.Material>(
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

/**
 * Configures a CanvasTexture for sharp, low-res PS2 nearest-neighbor sampling.
 */
function configurePs2Texture(
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

/** Deterministic pseudo-random helper for repeatable procedural textures & props */
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface TextureLibrary {
  sand: THREE.CanvasTexture;
  sandstone: THREE.CanvasTexture;
  sandstoneCarved: THREE.CanvasTexture;
  aythamStele: THREE.CanvasTexture;
  veshti: THREE.CanvasTexture;
  shield: THREE.CanvasTexture;
  bandage: THREE.CanvasTexture;
  alertQuestion: THREE.CanvasTexture;
  alertExclaim: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function createProceduralTextures(): TextureLibrary {
  const rand = seededRandom(1337);

  // 1. Desert Sand (64x64 pixelated wind-rippled ochre sand)
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = 64;
  sandCanvas.height = 64;
  const sctx = sandCanvas.getContext('2d')!;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const ripple = Math.sin((y * 0.45) + Math.sin(x * 0.2) * 1.4) * 12;
      const grain = (rand() - 0.5) * 18;
      const r = Math.min(255, Math.max(0, 214 + ripple + grain));
      const g = Math.min(255, Math.max(0, 161 + ripple * 0.8 + grain * 0.8));
      const b = Math.min(255, Math.max(0, 88 + ripple * 0.5 + grain * 0.5));
      sctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      sctx.fillRect(x, y, 1, 1);
    }
  }
  const sand = configurePs2Texture(sandCanvas, 34, 34);

  // 2. Weathered Egyptian Sandstone Blocks (64x64)
  const stoneCanvas = document.createElement('canvas');
  stoneCanvas.width = 64;
  stoneCanvas.height = 64;
  const stctx = stoneCanvas.getContext('2d')!;
  stctx.fillStyle = '#c59252';
  stctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = (rand() - 0.5) * 24;
      const strata = Math.sin(y * 0.35) * 7;
      const r = Math.min(255, Math.max(0, 196 + n + strata));
      const g = Math.min(255, Math.max(0, 146 + n * 0.8 + strata * 0.7));
      const b = Math.min(255, Math.max(0, 84 + n * 0.5));
      stctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      stctx.fillRect(x, y, 1, 1);
    }
  }
  // Block seams
  stctx.fillStyle = 'rgba(72, 42, 16, 0.55)';
  for (let row = 0; row < 4; row++) {
    const ry = row * 16;
    stctx.fillRect(0, ry, 64, 2);
    const offset = (row % 2) * 16;
    stctx.fillRect(offset, ry, 2, 16);
    stctx.fillRect((offset + 32) % 64, ry, 2, 16);
  }
  // Highlight edge
  stctx.fillStyle = 'rgba(245, 212, 142, 0.28)';
  for (let row = 0; row < 4; row++) {
    stctx.fillRect(0, row * 16 + 2, 64, 1);
  }
  const sandstone = configurePs2Texture(stoneCanvas, 2, 2);

  // 3. Carved Sandstone with Egyptian Frieze & Tamil ஃ Three-Dot Motif
  const carvedCanvas = document.createElement('canvas');
  carvedCanvas.width = 64;
  carvedCanvas.height = 64;
  const cctx = carvedCanvas.getContext('2d')!;
  cctx.drawImage(stoneCanvas, 0, 0);
  // Recessed dark frieze band
  cctx.fillStyle = 'rgba(78, 46, 18, 0.65)';
  cctx.fillRect(0, 22, 64, 20);
  cctx.fillStyle = '#d4a357';
  cctx.fillRect(0, 24, 64, 16);
  // Carved repeating three-dot Aytham (ஃ) + sun-bar glyphs
  for (let gx = 6; gx < 60; gx += 18) {
    // Three dots in triangle
    cctx.fillStyle = '#5c3414';
    cctx.fillRect(gx + 3, 27, 3, 3);
    cctx.fillRect(gx, 33, 3, 3);
    cctx.fillRect(gx + 6, 33, 3, 3);
    // Faint gold inlay pixel
    cctx.fillStyle = '#f2c45a';
    cctx.fillRect(gx + 4, 28, 1, 1);
    cctx.fillRect(gx + 1, 34, 1, 1);
    cctx.fillRect(gx + 7, 34, 1, 1);
    // Vertical divider
    cctx.fillStyle = '#6e401a';
    cctx.fillRect(gx + 12, 26, 2, 12);
  }
  const sandstoneCarved = configurePs2Texture(carvedCanvas, 1, 1);

  // 4. Aytham Stele Face (prominent carved Tamil ஃ three-dot emblem)
  const steleCanvas = document.createElement('canvas');
  steleCanvas.width = 64;
  steleCanvas.height = 64;
  const actx = steleCanvas.getContext('2d')!;
  actx.drawImage(stoneCanvas, 0, 0);
  // Darker framed sanctuary tablet
  actx.fillStyle = '#6c421c';
  actx.fillRect(8, 6, 48, 52);
  actx.fillStyle = '#8b5928';
  actx.fillRect(11, 9, 42, 46);
  // Gold border frame
  actx.strokeStyle = '#e8b648';
  actx.lineWidth = 2;
  actx.strokeRect(12, 10, 40, 44);
  // Radiant sun-eye arc at top
  actx.fillStyle = '#f5ca60';
  actx.fillRect(26, 14, 12, 2);
  actx.fillRect(30, 12, 4, 6);
  // Prominent Tamil ஃ (Aytham) — three glowing golden dots
  const drawAythamDot = (cx: number, cy: number) => {
    actx.fillStyle = '#3e2108';
    actx.fillRect(cx - 5, cy - 5, 10, 10);
    actx.fillStyle = '#d99a2e';
    actx.fillRect(cx - 4, cy - 4, 8, 8);
    actx.fillStyle = '#ffe082';
    actx.fillRect(cx - 2, cy - 2, 4, 4);
  };
  drawAythamDot(32, 27);
  drawAythamDot(23, 41);
  drawAythamDot(41, 41);
  const aythamStele = configurePs2Texture(steleCanvas, 1, 1);

  // 5. Traditional Tamil Veshti Wrap (cream cotton + crimson & gold temple border)
  const veshtiCanvas = document.createElement('canvas');
  veshtiCanvas.width = 64;
  veshtiCanvas.height = 64;
  const vctx = veshtiCanvas.getContext('2d')!;
  vctx.fillStyle = '#efe3c6';
  vctx.fillRect(0, 0, 64, 64);
  // Subtle vertical cotton weave pleats
  for (let x = 0; x < 64; x += 4) {
    vctx.fillStyle = x % 8 === 0 ? 'rgba(182, 155, 114, 0.22)' : 'rgba(255, 250, 236, 0.25)';
    vctx.fillRect(x, 0, 2, 64);
  }
  // Crimson & temple-gold lower border
  vctx.fillStyle = '#9e1c1c';
  vctx.fillRect(0, 48, 64, 10);
  vctx.fillStyle = '#e0ad3e';
  vctx.fillRect(0, 46, 64, 2);
  vctx.fillRect(0, 58, 64, 3);
  // Gold diamond motifs along crimson border
  vctx.fillStyle = '#f2c75c';
  for (let x = 4; x < 64; x += 8) {
    vctx.fillRect(x, 52, 2, 2);
  }
  const veshti = configurePs2Texture(veshtiCanvas, 2, 1);

  // 6. Ancient Tamil Kedayam Shield (bronze & gold concentric rings + ஃ dots)
  const shieldCanvas = document.createElement('canvas');
  shieldCanvas.width = 64;
  shieldCanvas.height = 64;
  const shctx = shieldCanvas.getContext('2d')!;
  shctx.fillStyle = '#5a3a18';
  shctx.fillRect(0, 0, 64, 64);
  // Concentric shield rings
  const drawCircle = (r: number, color: string) => {
    shctx.beginPath();
    shctx.arc(32, 32, r, 0, Math.PI * 2);
    shctx.fillStyle = color;
    shctx.fill();
  };
  drawCircle(31, '#d8a23a');
  drawCircle(27, '#4c2f14');
  drawCircle(24, '#8c5c26');
  drawCircle(17, '#3d2410');
  drawCircle(14, '#c28c30');
  // Radial sun rays
  shctx.strokeStyle = '#f0c45a';
  shctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    shctx.beginPath();
    shctx.moveTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14);
    shctx.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
    shctx.stroke();
  }
  // Central gold sun boss + three-dot aytham accent
  drawCircle(8, '#f0c14b');
  drawCircle(4, '#fff0b2');
  shctx.fillStyle = '#3a1f08';
  shctx.fillRect(31, 27, 2, 2);
  shctx.fillRect(28, 33, 2, 2);
  shctx.fillRect(34, 33, 2, 2);
  const shield = configurePs2Texture(shieldCanvas, 1, 1);

  // 7. Weathered Mummy Bandage Wrapping (64x64)
  const bandageCanvas = document.createElement('canvas');
  bandageCanvas.width = 64;
  bandageCanvas.height = 64;
  const bctx = bandageCanvas.getContext('2d')!;
  bctx.fillStyle = '#c8b68c';
  bctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const wrapSeam = y % 8 === 0 || (y + Math.floor(x / 12)) % 9 === 0;
      const grime = (rand() - 0.5) * 26;
      const d = wrapSeam ? -36 : grime;
      const r = Math.min(255, Math.max(0, 198 + d));
      const g = Math.min(255, Math.max(0, 178 + d * 0.92));
      const b = Math.min(255, Math.max(0, 134 + d * 0.8));
      bctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      bctx.fillRect(x, y, 1, 1);
    }
  }
  const bandage = configurePs2Texture(bandageCanvas, 1, 1);

  // 7b. Overhead Mummy Awareness Icons ("?" Suspicious & "!" Alert)
  const makeAlertIconTexture = (symbol: '?' | '!'): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(20, 10, 4, 0.88)';
    ctx.fillRect(5, 3, 22, 26);
    ctx.strokeStyle = symbol === '!' ? '#ff4a36' : '#f2be48';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 3, 22, 26);
    ctx.fillStyle = symbol === '!' ? '#ff5940' : '#ffe078';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 16, 17);
    const tex = configurePs2Texture(c, 1, 1);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };
  const alertQuestion = makeAlertIconTexture('?');
  const alertExclaim = makeAlertIconTexture('!');

  // 8. Soft radial contact shadow under the explorer
  const csCanvas = document.createElement('canvas');
  csCanvas.width = 64;
  csCanvas.height = 64;
  const csctx = csCanvas.getContext('2d')!;
  const grad = csctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(38, 22, 8, 0.65)');
  grad.addColorStop(0.65, 'rgba(38, 22, 8, 0.25)');
  grad.addColorStop(1, 'rgba(38, 22, 8, 0.0)');
  csctx.fillStyle = grad;
  csctx.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.CanvasTexture(csCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    sand,
    sandstone,
    sandstoneCarved,
    aythamStele,
    veshti,
    shield,
    bandage,
    alertQuestion,
    alertExclaim,
    contactShadow,
    dispose() {
      sand.dispose();
      sandstone.dispose();
      sandstoneCarved.dispose();
      aythamStele.dispose();
      veshti.dispose();
      shield.dispose();
      bandage.dispose();
      alertQuestion.dispose();
      alertExclaim.dispose();
      contactShadow.dispose();
    },
  };
}

/* ============================================================================
 * 3. AUDIO MODULE (Looping BGM + Procedural Web Audio SFX)
 * ==========================================================================*/

class AudioManager {
  private bgm: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private volume: number = CONFIG.DEFAULT_BGM_VOLUME;
  private muted = false;
  private started = false;

  constructor() {
    this.bgm = new Audio(BGM_URL);
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = this.volume;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public startFromUserGesture(): void {
    this.ensureContext();
    this.bgm.volume = this.muted ? 0 : this.volume;
    if (!this.started || this.bgm.paused) {
      this.bgm
        .play()
        .then(() => {
          this.started = true;
        })
        .catch(() => {
          // Will retry on next user interaction if blocked
        });
    }
  }

  public setVolume(nextVol: number): void {
    this.volume = THREE.MathUtils.clamp(nextVol, 0, 1);
    this.bgm.volume = this.muted ? 0 : this.volume;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    this.bgm.volume = this.muted ? 0 : this.volume;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Soft sand footstep crunch */
  public playFootstep(sprinting: boolean, sneaking: boolean): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = sprinting ? 0.08 : 0.1;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(sprinting ? 920 : 640, now);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    const baseGain = sneaking ? 0.035 : sprinting ? 0.11 : 0.07;
    gain.gain.setValueAtTime(baseGain * Math.max(0.35, this.volume * 2), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Vel spear thrust whoosh */
  public playSpearWhoosh(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = 0.22;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1450, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(320, now + duration);
    filter.Q.setValueAtTime(2.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * Math.max(0.4, this.volume * 2), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Kedayam bronze shield raise metallic clink */
  public playShieldGuard(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(195, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.11 * Math.max(0.4, this.volume * 2), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** Jump / landing / dodge sand thud */
  public playThud(pitch = 115, strength = 0.13): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(strength * Math.max(0.4, this.volume * 2), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Ancient Tamil-Egyptian Aytham stone resonance on E interact */
  public playStoneResonance(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [220, 330, 440];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);

      const gain = ctx.createGain();
      const peak = (idx === 0 ? 0.09 : 0.04) * Math.max(0.4, this.volume * 2);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.15);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    });
  }

  /** Combat impact thud + grit crunch (light for spear hit, heavy for player hurt) */
  public playHitImpact(heavy = false): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 132 : 195, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + (heavy ? 0.22 : 0.14));

    const oscGain = ctx.createGain();
    const scale = Math.max(0.4, this.volume * 2);
    oscGain.gain.setValueAtTime((heavy ? 0.28 : 0.2) * scale, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.24 : 0.15));
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    const len = Math.floor(ctx.sampleRate * 0.1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.4));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = heavy ? 480 : 980;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime((heavy ? 0.16 : 0.12) * scale, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);
  }

  /** Metallic Kedayam shield clang when absorbing an incoming attack */
  public playShieldBlockHit(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [420, 680, 1040].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'square' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.24);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime((idx === 0 ? 0.11 : 0.07) * scale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    });
  }

  /** Eerie low Cursed Mummy groan */
  public playMummyGroan(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.linearRampToValueAtTime(82, now + 0.36);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 330;
    filter.Q.value = 3.2;

    const gain = ctx.createGain();
    const scale = Math.max(0.4, this.volume * 2);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09 * scale, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** Dry bone/sandstone scatter when a mummy falls apart */
  public playMummyCrumble(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.36);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.42));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(860, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.34);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22 * Math.max(0.4, this.volume * 2), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Low solemn gong when the explorer falls */
  public playPlayerDeath(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [110, 82.4].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.9);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18 * scale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.0);
    });
  }

  /** Muffled silent takedown plunge + rapid crumble */
  public playStealthTakedown(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(46, now + 0.16);
    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.24 * scale, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(oGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(980, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.21);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.16 * scale, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now);
  }

  /** Weighted tomb pressure plate mechanical stone click */
  public playPressurePlateClick(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Sharp flint/bronze wall dart launch hiss */
  public playDartTrapFire(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(750, now + 0.13);
    filter.Q.value = 2.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Metallic ratchet warning tick before floor spikes shoot up */
  public playSpikeWarning(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.linearRampToValueAtTime(360, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Heavy iron spike thrust snap */
  public playSpikeSnap(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Heavy sandstone grinding rumble for stone doors, wheels, and crushers */
  public playStoneGrind(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const len = Math.floor(ctx.sampleRate * 0.42);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(240, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  /** Sacred harmonic chime for pedestal alignment & solved puzzles */
  public playPuzzleChime(step: number, complete: boolean): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const baseFreqs = [293.66, 369.99, 440, 587.33];
    const notes = complete
      ? baseFreqs
      : [baseFreqs[Math.min(step, baseFreqs.length - 1)]];

    notes.forEach((f, idx) => {
      const start = now + idx * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12 * scale, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  /** Rich golden shimmer when opening a treasure chest or claiming an artifact */
  public playTreasureOpen(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [440, 554.37, 659.25, 880].forEach((f, idx) => {
      const t = now + idx * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.09 * scale, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  /** Deep echoing whoosh + low boom when entering or leaving the sunken tomb */
  public playTombTransition(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.52);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  /** Deep resonant underworld roar when Anpu-Kar awakens or enters a new phase */
  public playBossRoar(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [98, 65.4].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 0.68, now + 0.85);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16 * scale, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.94);
    });
  }

  /** Heavy seismic boss ground slam boom */
  public playBossSlam(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.42);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.48);
  }

  /** Mystical underworld projectile / vortex cast sweep */
  public playBossCast(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.34);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14 * scale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  /** Solemn disintegration chord when Anpu-Kar collapses */
  public playBossDefeat(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [220, 164.81, 110].forEach((f, idx) => {
      const start = now + idx * 0.14;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.65, start + 1.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18 * scale, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.2);
    });
  }

  /** Triumphant golden chord when reclaiming the Crown of Korkai & Ra */
  public playVictoryFanfare(): void {
    if (this.muted || this.volume <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const scale = Math.max(0.4, this.volume * 2);
    [293.66, 369.99, 440, 587.33, 739.99].forEach((f, idx) => {
      const start = now + idx * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.14 * scale, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.3);
    });
  }

  public dispose(): void {
    this.bgm.pause();
    this.bgm.src = '';
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

/* ============================================================================
 * 4. WORLD MODULE (Terrain, Ruins, Aytham Motifs, Distant Pyramid, Lighting)
 * ==========================================================================*/

/**
 * Deterministic heightmap for the golden desert dunes.
 * Keeps a gently undulating basin around the Phase-1 ruins plaza and rises
 * into natural outer sand ridges toward the horizon so the world never ends
 * in a flat cutoff or floating wall.
 */
function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // Rolling desert wind-dunes
  const primaryDunes =
    Math.sin(x * 0.055 + z * 0.025) * 1.45 +
    Math.cos(z * 0.06 - x * 0.035) * 1.2;
  const secondaryRipples =
    Math.sin(x * 0.14 - z * 0.11) * 0.32 +
    Math.cos(x * 0.09 + z * 0.16) * 0.26;

  // Flatten slightly in the central ruins plaza (r < 22) for readable exploration
  const plazaBlend = THREE.MathUtils.smoothstep(distFromCenter, 6, 28);
  let h = (primaryDunes + secondaryRipples) * (0.28 + 0.72 * plazaBlend);

  // Subtle rise around the distant Great Pyramid plateau (-z direction)
  const distPyramid = Math.hypot(x, z + 124);
  if (distPyramid < 55) {
    const t = 1 - distPyramid / 55;
    h += t * t * 3.5;
  }

  // Natural perimeter dune ring beyond playable radius (leaving sightline north to Pyramid open)
  if (distFromCenter > 56) {
    const northOpening = THREE.MathUtils.clamp(
      1 - Math.exp(-Math.pow((x / 36), 2)) * (z < -20 ? 0.85 : 0),
      0.15,
      1.0
    );
    const rim = THREE.MathUtils.smoothstep(distFromCenter, 56, 115);
    h += rim * rim * 14.0 * northOpening;
  }

  return h;
}

interface WorldData {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  colliders: WorldCollider[];
  cameraOccluders: THREE.Object3D[];
  losOccluders: THREE.Object3D[];
  shadowZones: ShadowZone[];
  interactables: InteractableLandmark[];
  dustPoints: THREE.Points;
  setLightsEnabled: (enabled: boolean) => void;
  update: (dt: number, elapsed: number, playerPos: THREE.Vector3) => void;
}

function buildWorld(
  scene: THREE.Scene,
  textures: TextureLibrary,
  isSoftwareGl: boolean
): WorldData {
  const worldGroup = new THREE.Group();
  const colliders: WorldCollider[] = [];
  const cameraOccluders: THREE.Object3D[] = [];
  const losOccluders: THREE.Object3D[] = [];
  const shadowZones: ShadowZone[] = [];
  const interactables: InteractableLandmark[] = [];
  const rand = seededRandom(4021);

  // --------------------------------------------------------------------------
  // A. Sky Dome & Heavy Warm Desert Fog
  // --------------------------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.FOG_COLOR);
  scene.fog = new THREE.FogExp2(PALETTE.FOG_COLOR, 0.0135);

  const skyGeo = new THREE.SphereGeometry(230, 20, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(PALETTE.SKY_ZENITH) },
      uMid: { value: new THREE.Color(PALETTE.SKY_MID) },
      uHorizon: { value: new THREE.Color(PALETTE.SKY_HORIZON) },
      uSunDir: { value: new THREE.Vector3(-0.62, 0.34, -0.71).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uZenith, smoothstep(0.24, 0.78, h));
        float sunAmt = max(dot(dir, uSunDir), 0.0);
        // Warm solar haze halo + crisp low-poly desert sun disc
        col += vec3(1.0, 0.76, 0.38) * pow(sunAmt, 10.0) * 0.45;
        col += vec3(1.0, 0.94, 0.72) * smoothstep(0.994, 0.9985, sunAmt) * 0.95;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  worldGroup.add(skyMesh);

  // --------------------------------------------------------------------------
  // B. Day Lighting Rig (Long Dramatic Shadows + Warm/Cool Contrast)
  // --------------------------------------------------------------------------
  const hemiLight = new THREE.HemisphereLight(
    PALETTE.HEMI_SKY,
    PALETTE.HEMI_GROUND,
    0.95
  );
  worldGroup.add(hemiLight);

  // Low-angle golden late-afternoon sun casting long dramatic shadows
  const sunLight = new THREE.DirectionalLight(PALETTE.SUN_LIGHT, 2.55);
  sunLight.position.set(-54, 30, -62);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 175;
  const shadowBounds = 44;
  sunLight.shadow.camera.left = -shadowBounds;
  sunLight.shadow.camera.right = shadowBounds;
  sunLight.shadow.camera.top = shadowBounds;
  sunLight.shadow.camera.bottom = -shadowBounds;
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.normalBias = 0.04;
  worldGroup.add(sunLight);
  worldGroup.add(sunLight.target);

  // Warm desert bounce rim light from opposite angle
  const rimLight = new THREE.DirectionalLight(PALETTE.RIM_LIGHT, 0.45);
  rimLight.position.set(42, 18, 48);
  worldGroup.add(rimLight);

  // --------------------------------------------------------------------------
  // C. Shared PS2 Flat-Shaded Materials
  // --------------------------------------------------------------------------
  const sandMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      map: textures.sand,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: true,
    })
  );

  const sandstoneMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      color: 0xf0cfa0,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true,
    })
  );

  const sandstoneDarkMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      color: 0xb98a50,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    })
  );

  const carvedStoneMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      map: textures.sandstoneCarved,
      color: 0xf2d3a2,
      roughness: 0.84,
      metalness: 0.05,
      flatShading: true,
    })
  );

  const steleFaceMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      map: textures.aythamStele,
      roughness: 0.72,
      metalness: 0.14,
      flatShading: true,
    })
  );

  const ancientGoldMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      color: PALETTE.GOLD,
      roughness: 0.28,
      metalness: 0.86,
      flatShading: true,
    })
  );

  const aythamGlowMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      color: PALETTE.AYTHAM_GLOW,
      emissive: 0xd68a1a,
      emissiveIntensity: 0.7,
      roughness: 0.32,
      metalness: 0.65,
      flatShading: true,
    })
  );

  const clayPotMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      color: 0xa65834,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: true,
    })
  );

  // --------------------------------------------------------------------------
  // D. Rolling Desert Dune Terrain
  // --------------------------------------------------------------------------
  const terrainGeo = new THREE.PlaneGeometry(290, 290, 88, 88);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cLight = new THREE.Color(0xf4d299);
  const cMid = new THREE.Color(0xdba55c);
  const cShadow = new THREE.Color(0xb67d3d);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);

    const t = THREE.MathUtils.clamp((vy + 2.2) / 6.5, 0, 1);
    if (t < 0.5) {
      tmpCol.copy(cShadow).lerp(cMid, t * 2);
    } else {
      tmpCol.copy(cMid).lerp(cLight, (t - 0.5) * 2);
    }
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(terrainGeo, sandMat);
  terrainMesh.receiveShadow = true;
  worldGroup.add(terrainMesh);
  losOccluders.push(terrainMesh);

  // --------------------------------------------------------------------------
  // E. Giant Distant Pyramid (North Horizon Landmark)
  // --------------------------------------------------------------------------
  const pyramidGroup = new THREE.Group();
  const pyrX = 0;
  const pyrZ = -124;
  const pyrY = groundHeightAt(pyrX, pyrZ) - 2.0;
  pyramidGroup.position.set(pyrX, pyrY, pyrZ);

  // Multi-tiered monumental stepped core + smooth battered outer silhouette
  const pyrMainGeo = new THREE.ConeGeometry(52, 46, 4);
  pyrMainGeo.rotateY(Math.PI / 4);
  const pyrMain = new THREE.Mesh(pyrMainGeo, sandstoneMat);
  pyrMain.position.y = 23;
  pyramidGroup.add(pyrMain);

  // Lower monumental sandstone terrace courses (gives authentic Egyptian scale)
  for (let tier = 0; tier < 3; tier++) {
    const w = 78 - tier * 10;
    const h = 4.2;
    const tierMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      tier % 2 === 0 ? sandstoneDarkMat : sandstoneMat
    );
    tierMesh.position.y = 2.0 + tier * 3.8;
    pyramidGroup.add(tierMesh);
  }

  // Gleaming golden pyramidion capstone
  const capGeo = new THREE.ConeGeometry(9.6, 8.6, 4);
  capGeo.rotateY(Math.PI / 4);
  const capstone = new THREE.Mesh(capGeo, ancientGoldMat);
  capstone.position.y = 42.1;
  pyramidGroup.add(capstone);

  // Temple entrance pylon silhouette at the south face of the pyramid
  const pyrPortalLeft = new THREE.Mesh(
    new THREE.BoxGeometry(7, 13, 6),
    sandstoneDarkMat
  );
  pyrPortalLeft.position.set(-7.5, 6.5, 36);
  const pyrPortalRight = pyrPortalLeft.clone();
  pyrPortalRight.position.x = 7.5;
  const pyrLintel = new THREE.Mesh(
    new THREE.BoxGeometry(24, 3.6, 6.8),
    carvedStoneMat
  );
  pyrLintel.position.set(0, 14.5, 36);
  pyramidGroup.add(pyrPortalLeft, pyrPortalRight, pyrLintel);

  worldGroup.add(pyramidGroup);

  // Helper to construct a reusable Tamil ஃ (three-dot Aytham) relief emblem
  const createAythamEmblem = (scale = 1): THREE.Group => {
    const g = new THREE.Group();
    const dotGeo = new THREE.OctahedronGeometry(0.16 * scale, 0);
    const topDot = new THREE.Mesh(dotGeo, aythamGlowMat);
    topDot.position.set(0, 0.28 * scale, 0);
    const leftDot = new THREE.Mesh(dotGeo, aythamGlowMat);
    leftDot.position.set(-0.26 * scale, -0.18 * scale, 0);
    const rightDot = new THREE.Mesh(dotGeo, aythamGlowMat);
    rightDot.position.set(0.26 * scale, -0.18 * scale, 0);
    g.add(topDot, leftDot, rightDot);
    return g;
  };

  // Helper to build a faceted Egyptian sandstone column (intact or broken)
  const buildColumn = (
    x: number,
    z: number,
    height: number,
    broken: boolean
  ): THREE.Group => {
    const colGroup = new THREE.Group();
    const y = groundHeightAt(x, z);
    colGroup.position.set(x, y, z);

    // Square plinth base
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.55, 1.75),
      sandstoneDarkMat
    );
    base.position.y = 0.2;
    base.castShadow = true;
    base.receiveShadow = true;
    colGroup.add(base);

    // Faceted 8-sided sandstone shaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.68, height, 8),
      sandstoneMat
    );
    shaft.position.y = 0.45 + height / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    colGroup.add(shaft);

    if (!broken) {
      // Flared lotus capital + abacus block
      const capital = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.58, 0.72, 8),
        carvedStoneMat
      );
      capital.position.y = 0.45 + height + 0.36;
      capital.castShadow = true;
      capital.receiveShadow = true;
      colGroup.add(capital);

      const abacus = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.32, 1.7),
        sandstoneDarkMat
      );
      abacus.position.y = 0.45 + height + 0.88;
      abacus.castShadow = true;
      colGroup.add(abacus);
    } else {
      // Jagged fractured stone top
      const capFracture = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.54, 0),
        sandstoneDarkMat
      );
      capFracture.scale.set(1.0, 0.45, 1.0);
      capFracture.position.y = 0.45 + height;
      capFracture.rotation.set(0.3, rand() * 3, -0.2);
      capFracture.castShadow = true;
      colGroup.add(capFracture);
    }

    worldGroup.add(colGroup);
    colliders.push({
      type: 'cylinder',
      x,
      z,
      radius: 0.95,
      minY: y - 1,
      maxY: y + height + 1.5,
    });
    cameraOccluders.push(shaft, base);
    return colGroup;
  };

  // --------------------------------------------------------------------------
  // F. Landmark 1: The Aytham (ஃ) Waystone Shrine (Directly North of Spawn)
  // --------------------------------------------------------------------------
  const shrineX = 0;
  const shrineZ = -15;
  const shrineY = groundHeightAt(shrineX, shrineZ);
  const shrineGroup = new THREE.Group();
  shrineGroup.position.set(shrineX, shrineY, shrineZ);

  // Two-stepped ancient sandstone dais
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.42, 5.4),
    sandstoneDarkMat
  );
  step1.position.y = 0.16;
  step1.receiveShadow = true;
  step1.castShadow = true;
  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 0.42, 3.6),
    sandstoneMat
  );
  step2.position.y = 0.56;
  step2.receiveShadow = true;
  step2.castShadow = true;
  shrineGroup.add(step1, step2);

  // Central carved monolith stele bearing the sacred Tamil ஃ emblem
  const steleBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 3.2, 0.72),
    [
      sandstoneMat,
      sandstoneMat,
      sandstoneDarkMat,
      sandstoneDarkMat,
      steleFaceMat,
      steleFaceMat,
    ]
  );
  steleBody.position.set(0, 2.35, 0);
  steleBody.castShadow = true;
  steleBody.receiveShadow = true;
  shrineGroup.add(steleBody);

  // Bevelled pediment crown + sculpted golden Aytham three-dot crest
  const steleCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 1.25, 0.65, 4),
    sandstoneDarkMat
  );
  steleCrown.rotation.y = Math.PI / 4;
  steleCrown.position.set(0, 4.25, 0);
  steleCrown.castShadow = true;
  shrineGroup.add(steleCrown);

  const shrineEmblem = createAythamEmblem(0.95);
  shrineEmblem.position.set(0, 2.55, 0.42);
  shrineGroup.add(shrineEmblem);

  const shrineEmblemBack = createAythamEmblem(0.95);
  shrineEmblemBack.position.set(0, 2.55, -0.42);
  shrineGroup.add(shrineEmblemBack);

  worldGroup.add(shrineGroup);
  colliders.push({
    type: 'box',
    minX: shrineX - 1.15,
    maxX: shrineX + 1.15,
    minZ: shrineZ - 0.65,
    maxZ: shrineZ + 0.65,
    minY: shrineY,
    maxY: shrineY + 5,
  });
  cameraOccluders.push(steleBody);

  interactables.push({
    id: 'aytham-waystone',
    label: 'INSPECT AYTHAM WAYSTONE',
    title: 'WAYSTONE OF THE THREE DOTS (ஃ)',
    inscription:
      '"Three fires bind Tamilakam to the Nile. Walk beneath Ra\'s golden shadow, bearer of the Vel, and seek the seal of AKK."',
    position: new THREE.Vector3(shrineX, shrineY + 2.2, shrineZ),
    radius: 4.5,
  });

  // Flanking broken colonnade along the ceremonial avenue
  buildColumn(-6.5, -15, 5.2, false);
  buildColumn(6.5, -15, 3.1, true);
  buildColumn(-6.5, -22, 5.2, false);
  buildColumn(6.5, -22, 5.2, false);

  // Stone lintel bridging the two intact western columns
  const westColY = Math.max(groundHeightAt(-6.5, -15), groundHeightAt(-6.5, -22));
  const westLintel = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.95, 8.8),
    carvedStoneMat
  );
  westLintel.position.set(-6.5, westColY + 6.7, -18.5);
  westLintel.castShadow = true;
  westLintel.receiveShadow = true;
  worldGroup.add(westLintel);
  cameraOccluders.push(westLintel);

  // Fallen column drum half-buried in sand near the broken east pillar
  const fallenDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.62, 2.4, 8),
    sandstoneMat
  );
  const fdX = 8.8;
  const fdZ = -13.2;
  fallenDrum.position.set(fdX, groundHeightAt(fdX, fdZ) + 0.32, fdZ);
  fallenDrum.rotation.set(Math.PI / 2 - 0.14, 0.55, 0.12);
  fallenDrum.castShadow = true;
  fallenDrum.receiveShadow = true;
  worldGroup.add(fallenDrum);
  cameraOccluders.push(fallenDrum);
  colliders.push({
    type: 'cylinder',
    x: fdX,
    z: fdZ,
    radius: 1.15,
    minY: -5,
    maxY: 10,
  });

  // --------------------------------------------------------------------------
  // G. Landmark 2: Ruined Egyptian Pylon Archway (West-Southwest of Plaza)
  //    Provides tall solid walls to demonstrate smooth camera wall-collision!
  // --------------------------------------------------------------------------
  const archX = -15.5;
  const archZ = 4.0;
  const archY = groundHeightAt(archX, archZ);
  const archGroup = new THREE.Group();
  archGroup.position.set(archX, archY, archZ);

  const pylonGeo = new THREE.BoxGeometry(2.6, 6.2, 3.6);
  const pylonNorth = new THREE.Mesh(pylonGeo, sandstoneMat);
  pylonNorth.position.set(0, 3.0, -3.4);
  pylonNorth.castShadow = true;
  pylonNorth.receiveShadow = true;

  const pylonSouth = new THREE.Mesh(pylonGeo, sandstoneMat);
  pylonSouth.position.set(0, 3.0, 3.4);
  pylonSouth.castShadow = true;
  pylonSouth.receiveShadow = true;

  const archLintel = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 1.45, 11.2),
    carvedStoneMat
  );
  archLintel.position.set(0, 6.6, 0);
  archLintel.castShadow = true;
  archLintel.receiveShadow = true;

  // Aytham relief mounted on the lintel face
  const archEmblem = createAythamEmblem(1.1);
  archEmblem.rotation.y = Math.PI / 2;
  archEmblem.position.set(1.62, 6.6, 0);
  archGroup.add(pylonNorth, pylonSouth, archLintel, archEmblem);

  // Connected low ruined sandstone enclosure wall extending from south pylon
  const ruinWall = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.9, 7.6),
    sandstoneDarkMat
  );
  ruinWall.position.set(-0.4, 1.35, 8.8);
  ruinWall.castShadow = true;
  ruinWall.receiveShadow = true;
  archGroup.add(ruinWall);

  worldGroup.add(archGroup);

  // Colliders for both pylons and the extended wall (portal center remains open to walk through!)
  colliders.push(
    {
      type: 'box',
      minX: archX - 1.45,
      maxX: archX + 1.45,
      minZ: archZ - 5.35,
      maxZ: archZ - 1.45,
      minY: archY - 1,
      maxY: archY + 7,
    },
    {
      type: 'box',
      minX: archX - 1.45,
      maxX: archX + 1.45,
      minZ: archZ + 1.45,
      maxZ: archZ + 5.35,
      minY: archY - 1,
      maxY: archY + 7,
    },
    {
      type: 'box',
      minX: archX - 1.25,
      maxX: archX + 0.45,
      minZ: archZ + 4.9,
      maxZ: archZ + 12.7,
      minY: archY - 1,
      maxY: archY + 4,
    }
  );
  cameraOccluders.push(pylonNorth, pylonSouth, archLintel, ruinWall);

  interactables.push({
    id: 'sun-gate',
    label: 'INSPECT RUINED GATEWAY',
    title: 'GATE OF THE SUN CARAVAN',
    inscription:
      '"Merchants of Korkai once passed these pylons bearing pearls and iron. Now only the golden wind remembers their names."',
    position: new THREE.Vector3(archX + 1.2, archY + 2.0, archZ),
    radius: 5.2,
  });

  // --------------------------------------------------------------------------
  // H. Landmark 3: Tilted Half-Buried Obelisk & Ruined Sanctuary Wall (East)
  // --------------------------------------------------------------------------
  const obX = 16.5;
  const obZ = 2.5;
  const obY = groundHeightAt(obX, obZ);
  const obGroup = new THREE.Group();
  obGroup.position.set(obX, obY, obZ);

  const obPedestal = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.9, 3.2),
    sandstoneDarkMat
  );
  obPedestal.position.y = 0.25;
  obPedestal.castShadow = true;
  obPedestal.receiveShadow = true;
  obGroup.add(obPedestal);

  const obTilt = new THREE.Group();
  obTilt.rotation.set(0.16, -0.25, -0.22);
  const obShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 1.05, 8.2, 4),
    carvedStoneMat
  );
  obShaft.rotation.y = Math.PI / 4;
  obShaft.position.y = 4.1;
  obShaft.castShadow = true;
  obShaft.receiveShadow = true;

  const obTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.56, 1.25, 4),
    ancientGoldMat
  );
  obTip.rotation.y = Math.PI / 4;
  obTip.position.y = 8.82;
  obTip.castShadow = true;

  const obEmblem = createAythamEmblem(0.7);
  obEmblem.position.set(0, 2.6, 0.66);
  obTilt.add(obShaft, obTip, obEmblem);
  obGroup.add(obTilt);
  worldGroup.add(obGroup);

  colliders.push({
    type: 'cylinder',
    x: obX,
    z: obZ,
    radius: 1.75,
    minY: obY - 1,
    maxY: obY + 10,
  });
  cameraOccluders.push(obShaft, obPedestal);

  interactables.push({
    id: 'tilted-obelisk',
    label: 'READ FALLEN OBELISK',
    title: 'OBELISK OF THE BURIED SUN',
    inscription:
      '"Beneath the northern pyramid sleeps a vault sealed by three stars. Only those who master spear, shield, and shadow may enter."',
    position: new THREE.Vector3(obX, obY + 2.1, obZ),
    radius: 4.8,
  });

  // Extra distant broken columns framing the valley toward the Pyramid
  buildColumn(-19, -32, 4.4, true);
  buildColumn(20, -28, 5.4, false);
  buildColumn(26, -12, 2.8, true);

  // --------------------------------------------------------------------------
  // I. Scattered Ancient Clay Urns, Low-Poly Rocks & Dry Desert Scrub (Instanced)
  // --------------------------------------------------------------------------
  const urnPoints: [number, number][] = [
    [-3.6, -13.2],
    [-4.3, -12.6],
    [3.8, -14.0],
    [-13.4, 0.6],
    [14.2, 4.2],
  ];
  const urnLathePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.02),
    new THREE.Vector2(0.36, 0.35),
    new THREE.Vector2(0.28, 0.68),
    new THREE.Vector2(0.16, 0.82),
    new THREE.Vector2(0.24, 0.94),
  ];
  const urnGeo = new THREE.LatheGeometry(urnLathePts, 7);
  urnPoints.forEach(([ux, uz], i) => {
    const urn = new THREE.Mesh(urnGeo, clayPotMat);
    const uy = groundHeightAt(ux, uz);
    urn.position.set(ux, uy - 0.04, uz);
    urn.scale.setScalar(0.85 + (i % 3) * 0.16);
    if (i === 1) {
      urn.rotation.z = 1.25;
      urn.position.y += 0.24;
    }
    urn.castShadow = true;
    urn.receiveShadow = true;
    worldGroup.add(urn);
  });

  // Instanced desert sandstone rocks & outcrops
  const rockCount = 58;
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 0);
  const rockMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    })
  );
  const rockInstanced = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInstanced.castShadow = true;
  rockInstanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const rockTint = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const angle = rand() * Math.PI * 2;
    // Keep center spawn clear; scatter mid-distance and natural perimeter boulders
    const dist = i < 24 ? 14 + rand() * 32 : 44 + rand() * 36;
    const rx = Math.cos(angle) * dist;
    const rz = Math.sin(angle) * dist;
    // Avoid blocking the central shrine avenue or the hidden tomb entrance
    if (Math.hypot(rx - 12, rz + 32) < 6.2) {
      dummy.position.set(rx + 12, groundHeightAt(rx + 12, rz) - 0.25, rz - 10);
    } else if (Math.abs(rx) < 5.5 && rz > -26 && rz < 8) {
      dummy.position.set(rx + 18, groundHeightAt(rx + 18, rz) - 0.2, rz);
    } else {
      dummy.position.set(rx, groundHeightAt(rx, rz) - 0.25, rz);
    }
    const sx = (i < 24 ? 0.65 : 1.8) + rand() * (i < 24 ? 1.2 : 3.2);
    const sy = sx * (0.45 + rand() * 0.45);
    const sz = sx * (0.75 + rand() * 0.5);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6);
    dummy.updateMatrix();
    rockInstanced.setMatrixAt(i, dummy.matrix);

    rockTint.setHSL(0.085 + (rand() - 0.5) * 0.02, 0.42, 0.42 + rand() * 0.14);
    rockInstanced.setColorAt(i, rockTint);

    if (sx > 1.3 && dist < 64) {
      colliders.push({
        type: 'cylinder',
        x: dummy.position.x,
        z: dummy.position.z,
        radius: Math.max(sx, sz) * 0.72,
        minY: dummy.position.y - 2,
        maxY: dummy.position.y + sy * 1.5,
      });
    }
  }
  rockInstanced.instanceMatrix.needsUpdate = true;
  if (rockInstanced.instanceColor) rockInstanced.instanceColor.needsUpdate = true;
  rockInstanced.computeBoundingSphere();
  worldGroup.add(rockInstanced);
  losOccluders.push(rockInstanced);

  // --------------------------------------------------------------------------
  // I2. Shadowed Ruin Shelter & Designated Stealth Shadow Zones
  //     Darkened terrain-hugging patches under lintels, archway & ruin walls
  //     so illuminated sand vs. shadowed stealth cover is immediately clear.
  // --------------------------------------------------------------------------
  const eastShelterX = 13.0;
  const eastShelterZ = -5.5;
  const eastShelterY = groundHeightAt(eastShelterX, eastShelterZ);
  const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 3.2, 5.2),
    sandstoneDarkMat
  );
  eastWall.position.set(eastShelterX, eastShelterY + 1.5, eastShelterZ);
  eastWall.rotation.y = -0.35;
  eastWall.castShadow = true;
  eastWall.receiveShadow = true;
  const eastRoof = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.7, 5.4),
    carvedStoneMat
  );
  eastRoof.position.set(eastShelterX - 1.0, eastShelterY + 3.25, eastShelterZ + 0.3);
  eastRoof.rotation.y = -0.35;
  eastRoof.castShadow = true;
  eastRoof.receiveShadow = true;
  worldGroup.add(eastWall, eastRoof);
  cameraOccluders.push(eastWall, eastRoof);
  colliders.push({
    type: 'box',
    minX: eastShelterX - 1.1,
    maxX: eastShelterX + 1.1,
    minZ: eastShelterZ - 2.6,
    maxZ: eastShelterZ + 2.6,
    minY: eastShelterY - 1,
    maxY: eastShelterY + 4,
  });

  const shadowDefs: ShadowZone[] = [
    { id: 'west-colonnade', name: 'West Colonnade Shadow', x: -6.5, z: -18.5, radius: 3.4 },
    { id: 'pylon-arch', name: 'Sun Gate Shadow', x: -15.5, z: 4.0, radius: 3.8 },
    { id: 'pylon-wall', name: 'Ruined Wall Shadow', x: -13.6, z: 12.0, radius: 3.3 },
    { id: 'east-shelter', name: 'East Alcove Shadow', x: 11.4, z: -5.2, radius: 3.3 },
    { id: 'east-drum', name: 'Fallen Column Shadow', x: 9.2, z: -14.0, radius: 3.1 },
  ];

  const shadowOuterMat = new THREE.MeshBasicMaterial({
    color: 0x1a100c,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });
  const shadowInnerMat = new THREE.MeshBasicMaterial({
    color: 0x0b0605,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });

  const addTerrainConformingShadow = (
    sz: ShadowZone,
    rad: number,
    mat: THREE.MeshBasicMaterial,
    yOffset: number
  ) => {
    const geo = new THREE.CircleGeometry(rad, 10);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const wx = sz.x + pos.getX(i);
      const wz = sz.z + pos.getZ(i);
      pos.setY(i, groundHeightAt(wx, wz) + yOffset);
    }
    const patch = new THREE.Mesh(geo, mat);
    patch.position.set(sz.x, 0, sz.z);
    patch.renderOrder = 1;
    worldGroup.add(patch);
  };

  for (const sz of shadowDefs) {
    shadowZones.push(sz);
    addTerrainConformingShadow(sz, sz.radius, shadowOuterMat, 0.045);
    addTerrainConformingShadow(sz, sz.radius * 0.68, shadowInnerMat, 0.055);
  }

  // Instanced dry desert scrub tufts
  const scrubCount = 46;
  const scrubGeo = new THREE.ConeGeometry(0.42, 0.75, 5);
  scrubGeo.translate(0, 0.35, 0);
  const scrubMat = applyPs2VertexWobble(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      flatShading: true,
    })
  );
  const scrubInstanced = new THREE.InstancedMesh(scrubGeo, scrubMat, scrubCount);
  const scrubTint = new THREE.Color();
  for (let i = 0; i < scrubCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 9 + rand() * 48;
    const sx = Math.cos(angle) * dist;
    const sz = Math.sin(angle) * dist;
    dummy.position.set(sx, groundHeightAt(sx, sz) - 0.08, sz);
    const sc = 0.6 + rand() * 0.8;
    dummy.scale.set(sc * 1.2, sc * 0.7, sc * 1.2);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
    dummy.updateMatrix();
    scrubInstanced.setMatrixAt(i, dummy.matrix);
    scrubTint.setHSL(0.13 + rand() * 0.05, 0.32, 0.32 + rand() * 0.12);
    scrubInstanced.setColorAt(i, scrubTint);
  }
  scrubInstanced.instanceMatrix.needsUpdate = true;
  if (scrubInstanced.instanceColor) scrubInstanced.instanceColor.needsUpdate = true;
  scrubInstanced.computeBoundingSphere();
  worldGroup.add(scrubInstanced);

  // --------------------------------------------------------------------------
  // J. Drifting Golden Desert Dust Motes
  // --------------------------------------------------------------------------
  const dustCount = 140;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (rand() - 0.5) * 48;
    dustPositions[i * 3 + 1] = 0.5 + rand() * 9.0;
    dustPositions[i * 3 + 2] = (rand() - 0.5) * 48;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffdf9e,
    size: 0.16,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  worldGroup.add(dustPoints);

  // --------------------------------------------------------------------------
  // I3. Hidden Sunken Tomb Entrance (NE behind the Northern Ruined Avenue)
  // --------------------------------------------------------------------------
  const tombEntX = 12.0;
  const tombEntZ = -32.0;
  const tombEntY = groundHeightAt(tombEntX, tombEntZ);
  const tombEntGroup = new THREE.Group();
  tombEntGroup.position.set(tombEntX, tombEntY, tombEntZ);

  const entWallLeft = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.8, 3.8),
    sandstoneDarkMat
  );
  entWallLeft.position.set(-2.25, 1.15, 0);
  entWallLeft.castShadow = true;
  entWallLeft.receiveShadow = true;

  const entWallRight = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 2.8, 3.8),
    sandstoneDarkMat
  );
  entWallRight.position.set(2.25, 1.15, 0);
  entWallRight.castShadow = true;
  entWallRight.receiveShadow = true;

  const entLintel = new THREE.Mesh(
    new THREE.BoxGeometry(6.0, 0.95, 2.2),
    carvedStoneMat
  );
  entLintel.position.set(0, 2.75, -0.8);
  entLintel.castShadow = true;
  entLintel.receiveShadow = true;

  const entBackSeal = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.2, 0.65),
    new THREE.MeshBasicMaterial({ color: 0x0c0704 })
  );
  entBackSeal.position.set(0, 0.95, -1.35);

  const entEmblem = createAythamEmblem(0.95);
  entEmblem.position.set(0, 2.75, 0.36);

  // Sunken stone steps descending into the dark crypt opening
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.28, 0.85),
      sandstoneDarkMat
    );
    step.position.set(0, 0.08 - s * 0.22, 1.35 - s * 0.78);
    step.receiveShadow = true;
    tombEntGroup.add(step);
  }

  // Twin low stone braziers marking the hidden stairwell
  [-1.95, 1.95].forEach((bx) => {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.22, 0.7, 6),
      sandstoneDarkMat
    );
    pot.position.set(bx, 0.35, 1.95);
    const glow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      aythamGlowMat
    );
    glow.position.set(bx, 0.85, 1.95);
    tombEntGroup.add(pot, glow);
  });

  tombEntGroup.add(entWallLeft, entWallRight, entLintel, entBackSeal, entEmblem);
  worldGroup.add(tombEntGroup);
  cameraOccluders.push(entWallLeft, entWallRight, entLintel);

  // Subtle flagstone trail breadcrumbs from the North Avenue toward the crypt
  [
    [4.5, -26.5],
    [7.2, -28.0],
    [9.8, -29.3],
  ].forEach(([sx, sz]) => {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.16, 1.1),
      sandstoneDarkMat
    );
    slab.position.set(sx, groundHeightAt(sx, sz) + 0.03, sz);
    slab.rotation.y = 0.45;
    slab.receiveShadow = true;
    worldGroup.add(slab);
  });

  colliders.push(
    {
      type: 'box',
      minX: tombEntX - 2.9,
      maxX: tombEntX - 1.65,
      minZ: tombEntZ - 2.0,
      maxZ: tombEntZ + 2.0,
      minY: tombEntY - 1,
      maxY: tombEntY + 3.8,
    },
    {
      type: 'box',
      minX: tombEntX + 1.65,
      maxX: tombEntX + 2.9,
      minZ: tombEntZ - 2.0,
      maxZ: tombEntZ + 2.0,
      minY: tombEntY - 1,
      maxY: tombEntY + 3.8,
    },
    {
      type: 'box',
      minX: tombEntX - 2.1,
      maxX: tombEntX + 2.1,
      minZ: tombEntZ - 2.2,
      maxZ: tombEntZ - 1.0,
      minY: tombEntY - 1,
      maxY: tombEntY + 3.8,
    }
  );

  interactables.push({
    id: 'hidden-tomb-entrance',
    label: 'DESCEND INTO SUNKEN TOMB',
    title: 'SEAL OF THE SUNKEN TOMB',
    inscription: 'Ancient steps descend into the forgotten underground chamber.',
    position: new THREE.Vector3(tombEntX, tombEntY + 0.8, tombEntZ + 0.9),
    radius: 3.4,
  });

  scene.add(worldGroup);
  losOccluders.push(...cameraOccluders);

  return {
    group: worldGroup,
    sunLight,
    colliders,
    cameraOccluders,
    losOccluders,
    shadowZones,
    interactables,
    dustPoints,
    setLightsEnabled(enabled: boolean) {
      hemiLight.visible = enabled;
      sunLight.visible = enabled;
      rimLight.visible = enabled;
    },
    update(dt: number, elapsed: number, playerPos: THREE.Vector3) {
      // Keep directional sun shadow frustum centered around the player
      sunLight.position.set(
        playerPos.x - 54,
        playerPos.y + 30,
        playerPos.z - 62
      );
      sunLight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
      sunLight.target.updateMatrixWorld();

      // Gentle mineral shimmer on the ancient Aytham three-dot emblems
      aythamGlowMat.emissiveIntensity = 0.58 + Math.sin(elapsed * 2.2) * 0.22;

      // Drift sand dust motes around player volume
      const attr = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        let dx = attr.getX(i) + dt * 1.45;
        let dy = attr.getY(i) + Math.sin(elapsed * 0.8 + i) * dt * 0.15;
        let dz = attr.getZ(i) + dt * 0.45;

        if (dx - playerPos.x > 24) dx -= 48;
        if (dx - playerPos.x < -24) dx += 48;
        if (dz - playerPos.z > 24) dz -= 48;
        if (dz - playerPos.z < -24) dz += 48;
        if (dy < 0.4) dy = 8.5;
        if (dy > 9.5) dy = 0.8;

        attr.setXYZ(i, dx, dy, dz);
      }
      attr.needsUpdate = true;
    },
  };
}

/* ============================================================================
 * 5. PLAYER MODULE (Ancient Tamil Explorer Model, Physics & Animations)
 * ==========================================================================*/

interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  sneak: boolean;
  block: boolean;
  jumpHeld: boolean;
  jumpBufferedTimer: number;
  attackQueued: boolean;
  dodgeQueued: boolean;
}

interface DevModeOptions {
  godMode: boolean;
  noBarriers: boolean;
  speedBoost: boolean;
}

interface DustPuff {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

class PlayerController {
  public readonly root: THREE.Group;
  public readonly position: THREE.Vector3;
  public facingYaw = Math.PI; // Faces north toward the shrine & distant Pyramid on start
  public stance: PlayerStance = 'IDLE';
  public attackCameraPunch = 0;

  public health: number = CONFIG.PLAYER_MAX_HEALTH;
  public stamina: number = CONFIG.PLAYER_MAX_STAMINA;
  public dead = false;

  private staminaRegenTimer = 0;
  private velocityY = 0;
  private grounded = true;
  private coyoteTimer = 0;
  private animTime = 0;
  private moveBlend = 0;
  private landSquash = 0;

  private attackTimer = 0;
  private attackCooldown = 0;
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private invulnTimer = 0;
  private takedownTimer = 0;
  private crouching = false;
  private sprintingFlag = false;
  private movingFlag = false;
  private hitFlashTimer = 0;
  private hitFlashColor = 0xc8261c;
  private knockbackVel = new THREE.Vector3();
  private dodgeDir = new THREE.Vector3(0, 0, -1);
  private wasBlocking = false;
  private footstepTimer = 0;
  private flashMaterials: Array<{ mat: THREE.MeshStandardMaterial; baseEmissive: number }> = [];
  private onAttackStarted: (() => void) | null = null;

  // Articulated rig references
  private pelvis: THREE.Group;
  private torso: THREE.Group;
  private headGroup: THREE.Group;
  private hairBack: THREE.Group;
  private leftShoulder: THREE.Group;
  private rightShoulder: THREE.Group;
  private leftForearm: THREE.Group;
  private rightForearm: THREE.Group;
  private leftHip: THREE.Group;
  private rightHip: THREE.Group;
  private leftKnee: THREE.Group;
  private rightKnee: THREE.Group;
  private velStreamers: THREE.Mesh[];
  private sashTail: THREE.Mesh;
  private slashArc: THREE.Mesh;
  private contactShadow: THREE.Mesh;

  // Pooled sand dust puffs for footsteps, landing, and dodge rolls
  private dustPool: DustPuff[] = [];

  constructor(scene: THREE.Scene, textures: TextureLibrary) {
    this.root = new THREE.Group();
    this.position = this.root.position;
    this.position.set(0, groundHeightAt(0, 4), 4);

    // ------------------------------------------------------------------------
    // Materials with realistic roughness/metalness contrast (PS2 flat-shaded)
    // ------------------------------------------------------------------------
    const skinMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.SKIN_BRONZE,
        roughness: 0.72,
        metalness: 0.04,
        flatShading: true,
      })
    );
    const hairMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.HAIR_DARK,
        roughness: 0.88,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const veshtiMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        map: textures.veshti,
        roughness: 0.86,
        metalness: 0.0,
        flatShading: true,
      })
    );
    const crimsonClothMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.CRIMSON,
        roughness: 0.82,
        metalness: 0.02,
        side: THREE.DoubleSide,
        flatShading: true,
      })
    );
    const leatherMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.LEATHER,
        roughness: 0.78,
        metalness: 0.08,
        flatShading: true,
      })
    );
    const goldMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.GOLD,
        roughness: 0.25,
        metalness: 0.88,
        flatShading: true,
      })
    );
    const bronzeMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: PALETTE.BRONZE,
        roughness: 0.34,
        metalness: 0.78,
        flatShading: true,
      })
    );
    const woodMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        color: 0x5c361c,
        roughness: 0.82,
        metalness: 0.05,
        flatShading: true,
      })
    );
    const whiteMarkMat = new THREE.MeshBasicMaterial({ color: 0xf6f0e2 });
    const tilakMat = new THREE.MeshBasicMaterial({ color: 0xd9261c });

    const shieldFaceMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        map: textures.shield,
        roughness: 0.32,
        metalness: 0.75,
        flatShading: true,
      })
    );

    [
      skinMat,
      hairMat,
      veshtiMat,
      crimsonClothMat,
      leatherMat,
      goldMat,
      bronzeMat,
      woodMat,
      shieldFaceMat,
    ].forEach((mat) => {
      this.flashMaterials.push({ mat, baseEmissive: mat.emissive.getHex() });
    });

    // ------------------------------------------------------------------------
    // Pelvis / Waist / Veshti / Belt / Explorer Satchel
    // ------------------------------------------------------------------------
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.94;
    this.root.add(this.pelvis);

    // Draped veshti upper skirt wrap
    const veshtiUpper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.31, 0.38, 7),
      veshtiMat
    );
    veshtiUpper.position.y = -0.14;
    veshtiUpper.castShadow = true;
    this.pelvis.add(veshtiUpper);

    // Front folded veshti panel
    const veshtiFront = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.56, 0.1),
      veshtiMat
    );
    veshtiFront.position.set(0, -0.32, 0.14);
    veshtiFront.castShadow = true;
    this.pelvis.add(veshtiFront);

    // Crimson waist cloth & draping sash tail
    const crimsonWrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.255, 0.265, 0.14, 7),
      crimsonClothMat
    );
    crimsonWrap.position.y = 0.03;
    crimsonWrap.castShadow = true;
    this.pelvis.add(crimsonWrap);

    this.sashTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.58, 0.03),
      crimsonClothMat
    );
    this.sashTail.position.set(-0.22, -0.32, 0.06);
    this.sashTail.rotation.z = -0.15;
    this.sashTail.castShadow = true;
    this.pelvis.add(this.sashTail);

    // Heavy leather belt with golden sun-buckle & Aytham three dots
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.265, 0.265, 0.1, 8),
      leatherMat
    );
    belt.position.y = 0.04;
    this.pelvis.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.05, 8),
      goldMat
    );
    buckle.rotation.x = Math.PI / 2;
    buckle.position.set(0, 0.04, 0.25);
    this.pelvis.add(buckle);

    // Leather explorer satchel strapped at right hip
    const satchel = new THREE.Group();
    satchel.position.set(0.27, -0.14, -0.02);
    satchel.rotation.z = 0.12;
    const bagBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.24, 0.22),
      leatherMat
    );
    bagBody.castShadow = true;
    const bagFlap = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.09, 0.23),
      leatherMat
    );
    bagFlap.position.y = 0.08;
    const bagClasp = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.05),
      goldMat
    );
    bagClasp.position.set(0.08, 0.03, 0);
    satchel.add(bagBody, bagFlap, bagClasp);
    this.pelvis.add(satchel);

    // ------------------------------------------------------------------------
    // Torso (Bare Muscular Chest, Gold Ornaments, Diagonal Explorer Strap)
    // ------------------------------------------------------------------------
    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.pelvis.add(this.torso);

    // Tapered athletic chest
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.2, 0.54, 6),
      skinMat
    );
    chest.scale.set(1.15, 1, 0.78);
    chest.position.y = 0.28;
    chest.castShadow = true;
    this.torso.add(chest);

    // Ornate golden Tamil collar / necklace
    const necklace = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.026, 5, 8),
      goldMat
    );
    necklace.rotation.x = Math.PI / 2 + 0.22;
    necklace.position.set(0, 0.5, 0.04);
    this.torso.add(necklace);

    const pendant = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.042, 0),
      goldMat
    );
    pendant.position.set(0, 0.44, 0.18);
    this.torso.add(pendant);

    // Diagonal leather & white sash across bare chest
    const chestStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.62, 0.36),
      leatherMat
    );
    chestStrap.position.set(0, 0.29, 0.01);
    chestStrap.rotation.z = 0.52;
    this.torso.add(chestStrap);

    const strapMedallion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6),
      goldMat
    );
    strapMedallion.rotation.x = Math.PI / 2;
    strapMedallion.position.set(0.05, 0.28, 0.2);
    this.torso.add(strapMedallion);

    // ------------------------------------------------------------------------
    // Head, Dark Beard, Flowing Hair, Headband & Sacred Forehead Marks
    // ------------------------------------------------------------------------
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.57, 0);
    this.torso.add(this.headGroup);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.1, 0.12, 6),
      skinMat
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.28, 0.25),
      skinMat
    );
    head.position.y = 0.21;
    head.castShadow = true;
    this.headGroup.add(head);

    // Sculpted nose ridge
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.07, 0.05),
      skinMat
    );
    nose.position.set(0, 0.21, 0.14);
    this.headGroup.add(nose);

    // Full dark beard & jaw contour
    const beard = new THREE.Mesh(
      new THREE.ConeGeometry(0.135, 0.19, 6),
      hairMat
    );
    beard.rotation.x = Math.PI;
    beard.scale.set(1.0, 1.0, 0.92);
    beard.position.set(0, 0.1, 0.04);
    beard.castShadow = true;
    this.headGroup.add(beard);

    // Sacred Tamil forehead vibhuti (three white stripes) + red tilak
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.014, 0.012),
        whiteMarkMat
      );
      stripe.position.set(0, 0.292 - i * 0.022, 0.128);
      this.headGroup.add(stripe);
    }
    const tilak = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.028, 0.016),
      tilakMat
    );
    tilak.position.set(0, 0.27, 0.132);
    this.headGroup.add(tilak);

    // Crimson & gold warrior headband
    const headband = new THREE.Mesh(
      new THREE.BoxGeometry(0.265, 0.055, 0.275),
      crimsonClothMat
    );
    headband.position.set(0, 0.315, 0);
    this.headGroup.add(headband);

    const headbandTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.016, 0.28),
      goldMat
    );
    headbandTrim.position.set(0, 0.335, 0);
    this.headGroup.add(headbandTrim);

    // Crown of dark hair + flowing back locks
    const hairTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.09, 0.27),
      hairMat
    );
    hairTop.position.set(0, 0.37, -0.01);
    hairTop.castShadow = true;
    this.headGroup.add(hairTop);

    this.hairBack = new THREE.Group();
    this.hairBack.position.set(0, 0.28, -0.12);
    const hairMainLock = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.34, 0.12),
      hairMat
    );
    hairMainLock.position.set(0, -0.14, -0.02);
    hairMainLock.rotation.x = 0.18;
    hairMainLock.castShadow = true;
    const headbandTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.28, 0.02),
      crimsonClothMat
    );
    headbandTail.position.set(0.06, -0.12, -0.09);
    headbandTail.rotation.x = 0.25;
    this.hairBack.add(hairMainLock, headbandTail);
    this.headGroup.add(this.hairBack);

    // ------------------------------------------------------------------------
    // Right Arm + Sacred Tamil Vel (Spear) with Fluttering Crimson Streamers
    // ------------------------------------------------------------------------
    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(-0.34, 0.48, 0);
    this.torso.add(this.rightShoulder);

    const rUpperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.072, 0.32, 6),
      skinMat
    );
    rUpperArm.position.y = -0.14;
    rUpperArm.castShadow = true;
    this.rightShoulder.add(rUpperArm);

    const rArmlet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6),
      goldMat
    );
    rArmlet.position.y = -0.13;
    this.rightShoulder.add(rArmlet);

    this.rightForearm = new THREE.Group();
    this.rightForearm.position.y = -0.3;
    this.rightShoulder.add(this.rightForearm);

    const rForearmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.056, 0.3, 6),
      skinMat
    );
    rForearmMesh.position.y = -0.14;
    rForearmMesh.castShadow = true;
    const rBracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.064, 0.12, 6),
      leatherMat
    );
    rBracer.position.y = -0.2;
    this.rightForearm.add(rForearmMesh, rBracer);

    // Vel Spear Group held in Right Hand
    const velGroup = new THREE.Group();
    velGroup.position.set(0, -0.28, 0.05);
    velGroup.rotation.x = Math.PI / 2 - 0.18;
    this.rightForearm.add(velGroup);

    const velShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.026, 2.25, 6),
      woodMat
    );
    velShaft.position.y = 0.25;
    velShaft.castShadow = true;
    velGroup.add(velShaft);

    // Decorative bronze grip bands & butt-cap
    const velCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.032, 0.12, 6),
      goldMat
    );
    velCollar.position.y = 1.35;
    const velButt = new THREE.Mesh(
      new THREE.ConeGeometry(0.032, 0.14, 5),
      bronzeMat
    );
    velButt.rotation.x = Math.PI;
    velButt.position.y = -0.92;
    velGroup.add(velCollar, velButt);

    // Iconic leaf/diamond-shaped sacred golden Vel spearhead
    const velBlade = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      goldMat
    );
    velBlade.scale.set(0.55, 2.1, 0.24);
    velBlade.position.y = 1.66;
    velBlade.castShadow = true;
    velGroup.add(velBlade);

    // Fluttering crimson cloth streamers tied beneath the Vel spearhead
    this.velStreamers = [];
    for (let s = 0; s < 2; s++) {
      const streamer = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.44 - s * 0.1, 0.012),
        crimsonClothMat
      );
      streamer.position.set(s === 0 ? 0.03 : -0.02, 1.16, 0.04);
      velGroup.add(streamer);
      this.velStreamers.push(streamer);
    }

    // Golden thrust/sweep swoosh arc (shown briefly during Left-Click attack)
    const slashGeo = new THREE.RingGeometry(0.65, 1.45, 10, 1, -0.7, 1.4);
    const slashMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.slashArc = new THREE.Mesh(slashGeo, slashMat);
    this.slashArc.rotation.x = -Math.PI / 2;
    this.slashArc.position.set(0, 1.15, 0.75);
    this.root.add(this.slashArc);

    // ------------------------------------------------------------------------
    // Left Arm + Ancient Tamil Kedayam (Round Bronze & Gold Shield)
    // ------------------------------------------------------------------------
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(0.34, 0.48, 0);
    this.torso.add(this.leftShoulder);

    const lUpperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.072, 0.32, 6),
      skinMat
    );
    lUpperArm.position.y = -0.14;
    lUpperArm.castShadow = true;
    this.leftShoulder.add(lUpperArm);

    const lArmlet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6),
      goldMat
    );
    lArmlet.position.y = -0.13;
    this.leftShoulder.add(lArmlet);

    this.leftForearm = new THREE.Group();
    this.leftForearm.position.y = -0.3;
    this.leftShoulder.add(this.leftForearm);

    const lForearmMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.056, 0.3, 6),
      skinMat
    );
    lForearmMesh.position.y = -0.14;
    lForearmMesh.castShadow = true;
    const lBracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.064, 0.12, 6),
      leatherMat
    );
    lBracer.position.y = -0.2;
    this.leftForearm.add(lForearmMesh, lBracer);

    // Kedayam Shield mounted to outer left forearm
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(0.11, -0.18, 0.05);
    shieldGroup.rotation.z = -Math.PI / 2;
    const shieldDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.44, 0.06, 10),
      [bronzeMat, shieldFaceMat, leatherMat]
    );
    shieldDisc.castShadow = true;
    const shieldBoss = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.09, 6),
      goldMat
    );
    shieldBoss.position.y = 0.06;
    shieldGroup.add(shieldDisc, shieldBoss);
    this.leftForearm.add(shieldGroup);

    // ------------------------------------------------------------------------
    // Legs (Draped Veshti Thighs + Laced Leather Explorer Sandals/Greaves)
    // ------------------------------------------------------------------------
    const buildLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.135, -0.05, 0);
      this.pelvis.add(hip);

      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.105, 0.46, 6),
        veshtiMat
      );
      thigh.position.y = -0.23;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);

      const calf = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.066, 0.38, 6),
        leatherMat
      );
      calf.position.y = -0.2;
      calf.castShadow = true;
      knee.add(calf);

      const sandalTrim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.084, 0.084, 0.04, 6),
        goldMat
      );
      sandalTrim.position.y = -0.03;
      knee.add(sandalTrim);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.08, 0.23),
        leatherMat
      );
      foot.position.set(0, -0.4, 0.05);
      foot.castShadow = true;
      knee.add(foot);

      return { hip, knee };
    };

    const leftLeg = buildLeg(1);
    const rightLeg = buildLeg(-1);
    this.leftHip = leftLeg.hip;
    this.leftKnee = leftLeg.knee;
    this.rightHip = rightLeg.hip;
    this.rightKnee = rightLeg.knee;

    this.root.rotation.y = this.facingYaw;
    scene.add(this.root);

    // Soft grounding contact shadow disc beneath explorer
    const csGeo = new THREE.PlaneGeometry(1.5, 1.5);
    csGeo.rotateX(-Math.PI / 2);
    const csMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.contactShadow = new THREE.Mesh(csGeo, csMat);
    this.contactShadow.renderOrder = 1;
    scene.add(this.contactShadow);

    // Pooled sand dust puffs
    const puffGeo = new THREE.DodecahedronGeometry(0.16, 0);
    for (let i = 0; i < 16; i++) {
      const puffMat = new THREE.MeshBasicMaterial({
        color: 0xe6be7a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(puffGeo, puffMat);
      mesh.visible = false;
      scene.add(mesh);
      this.dustPool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.45,
      });
    }
  }

  private spawnDustPuff(count: number, spread = 0.8): void {
    let spawned = 0;
    for (let i = 0; i < this.dustPool.length && spawned < count; i++) {
      const p = this.dustPool[i];
      if (p.life <= 0) {
        p.life = 0.36 + Math.random() * 0.22;
        p.maxLife = p.life;
        p.mesh.visible = true;
        p.mesh.position.set(
          this.position.x + (Math.random() - 0.5) * 0.45,
          this.position.y + 0.12,
          this.position.z + (Math.random() - 0.5) * 0.45
        );
        p.vel.set(
          (Math.random() - 0.5) * spread,
          0.6 + Math.random() * 0.8,
          (Math.random() - 0.5) * spread
        );
        p.mesh.scale.setScalar(0.65);
        spawned++;
      }
    }
  }

  private updateDustPuffs(dt: number): void {
    for (let i = 0; i < this.dustPool.length; i++) {
      const p = this.dustPool[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.addScaledVector(p.vel, dt);
          p.vel.y -= 1.2 * dt;
          const progress = 1 - p.life / p.maxLife;
          p.mesh.scale.setScalar(0.65 + progress * 1.5);
          (p.mesh.material as THREE.MeshBasicMaterial).opacity =
            (1 - progress) * 0.5;
        }
      }
    }
  }

  /**
   * Resolves horizontal player collisions against world pillars, walls, and natural perimeter.
   */
  private resolveCollisions(
    colliders: WorldCollider[],
    useWorldClamp = true
  ): void {
    const playerRadius = 0.48;
    const py = this.position.y;

    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      if (py > col.maxY || py + 1.8 < col.minY) continue;

      if (col.type === 'cylinder') {
        const dx = this.position.x - col.x;
        const dz = this.position.z - col.z;
        const distSq = dx * dx + dz * dz;
        const minDist = playerRadius + col.radius;
        if (distSq < minDist * minDist && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = minDist - dist;
          this.position.x += (dx / dist) * push;
          this.position.z += (dz / dist) * push;
        }
      } else {
        const closestX = THREE.MathUtils.clamp(
          this.position.x,
          col.minX,
          col.maxX
        );
        const closestZ = THREE.MathUtils.clamp(
          this.position.z,
          col.minZ,
          col.maxZ
        );
        const dx = this.position.x - closestX;
        const dz = this.position.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < playerRadius * playerRadius) {
          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const push = playerRadius - dist;
            this.position.x += (dx / dist) * push;
            this.position.z += (dz / dist) * push;
          } else {
            // Inside box fallback: push out nearest edge
            const dMinX = Math.abs(this.position.x - col.minX);
            const dMaxX = Math.abs(col.maxX - this.position.x);
            const dMinZ = Math.abs(this.position.z - col.minZ);
            const dMaxZ = Math.abs(col.maxZ - this.position.z);
            const m = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
            if (m === dMinX) this.position.x = col.minX - playerRadius;
            else if (m === dMaxX) this.position.x = col.maxX + playerRadius;
            else if (m === dMinZ) this.position.z = col.minZ - playerRadius;
            else this.position.z = col.maxZ + playerRadius;
          }
        }
      }
    }

    // Soft natural perimeter boundary (desert only; tomb uses perimeter walls)
    if (useWorldClamp) {
      const r = Math.hypot(this.position.x, this.position.z);
      if (r > CONFIG.WORLD_PLAY_RADIUS) {
        const scale = CONFIG.WORLD_PLAY_RADIUS / r;
        this.position.x *= scale;
        this.position.z *= scale;
      }
    }
  }

  public healVitals(hp: number, stamina: number): void {
    if (this.dead) return;
    if (hp > 0) {
      this.health = Math.min(CONFIG.PLAYER_MAX_HEALTH, this.health + hp);
    }
    if (stamina > 0) {
      this.stamina = Math.min(CONFIG.PLAYER_MAX_STAMINA, this.stamina + stamina);
    }
  }

  public teleportTo(x: number, y: number, z: number, yaw: number): void {
    this.position.set(x, y, z);
    this.facingYaw = yaw;
    this.root.rotation.y = yaw;
    this.velocityY = 0;
    this.grounded = true;
    this.knockbackVel.set(0, 0, 0);
    this.contactShadow.position.set(x, y + 0.04, z);
  }

  public setAttackCallback(cb: () => void): void {
    this.onAttackStarted = cb;
  }

  public isBlocking(): boolean {
    return this.stance === 'BLOCK' && !this.dead;
  }

  public isSneaking(): boolean {
    return this.crouching && !this.dead;
  }

  public isSprinting(): boolean {
    return this.sprintingFlag && !this.dead;
  }

  public isMoving(): boolean {
    return this.movingFlag && !this.dead;
  }

  public isTakedownActive(): boolean {
    return this.takedownTimer > 0;
  }

  public isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  public startTakedown(targetPos: THREE.Vector3): void {
    this.takedownTimer = CONFIG.STEALTH_TAKEDOWN_DURATION;
    this.invulnTimer = CONFIG.STEALTH_TAKEDOWN_DURATION;
    this.attackTimer = 0;
    this.dodgeTimer = 0;
    this.sprintingFlag = false;
    this.movingFlag = false;
    const dx = targetPos.x - this.position.x;
    const dz = targetPos.z - this.position.z;
    this.facingYaw = Math.atan2(dx, dz);
    this.spawnDustPuff(4, 0.9);
  }

  public isAttackHitActive(): boolean {
    if (this.attackTimer <= 0 || this.dead) return false;
    const p = 1 - this.attackTimer / CONFIG.ATTACK_DURATION;
    return p >= CONFIG.ATTACK_HIT_START && p <= CONFIG.ATTACK_HIT_END;
  }

  public spendStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaRegenTimer = CONFIG.STAMINA_REGEN_DELAY;
  }

  public applyDamage(amount: number, knockDir: THREE.Vector3 | null, isBlocked: boolean): void {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.hitFlashTimer = CONFIG.HIT_FLASH_DURATION;
    this.hitFlashColor = isBlocked ? 0xe6b446 : 0xd9281c;
    if (knockDir) {
      const force = isBlocked ? 3.2 : 6.4;
      this.knockbackVel.set(knockDir.x * force, 0, knockDir.z * force);
    }
    if (this.health <= 0) {
      this.dead = true;
    }
  }

  public reset(): void {
    this.health = CONFIG.PLAYER_MAX_HEALTH;
    this.stamina = CONFIG.PLAYER_MAX_STAMINA;
    this.staminaRegenTimer = 0;
    this.dead = false;
    this.velocityY = 0;
    this.grounded = true;
    this.coyoteTimer = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.dodgeTimer = 0;
    this.dodgeCooldown = 0;
    this.invulnTimer = 0;
    this.takedownTimer = 0;
    this.crouching = false;
    this.sprintingFlag = false;
    this.movingFlag = false;
    this.hitFlashTimer = 0;
    this.knockbackVel.set(0, 0, 0);
    this.stance = 'IDLE';
    this.facingYaw = Math.PI;
    this.position.set(0, groundHeightAt(0, 4), 4);
    this.root.rotation.y = this.facingYaw;
    this.pelvis.position.y = 0.94;
    this.pelvis.rotation.set(0, 0, 0);
    this.flashMaterials.forEach(({ mat, baseEmissive }) => {
      mat.emissive.setHex(baseEmissive);
    });
  }

  public update(
    dt: number,
    elapsed: number,
    input: InputState,
    cameraYaw: number,
    colliders: WorldCollider[],
    audio: AudioManager,
    activeControl: boolean,
    groundHeightFn: (x: number, z: number) => number = groundHeightAt,
    useWorldClamp = true,
    devOptions?: DevModeOptions
  ): void {
    this.updateDustPuffs(dt);
    this.attackCameraPunch = THREE.MathUtils.damp(
      this.attackCameraPunch,
      0,
      12,
      dt
    );
    this.landSquash = THREE.MathUtils.damp(this.landSquash, 0, 14, dt);

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flash = this.hitFlashTimer > 0 ? this.hitFlashColor : null;
      this.flashMaterials.forEach(({ mat, baseEmissive }) => {
        mat.emissive.setHex(flash !== null ? flash : baseEmissive);
      });
    }

    if (devOptions?.godMode) {
      this.health = CONFIG.PLAYER_MAX_HEALTH;
      this.stamina = CONFIG.PLAYER_MAX_STAMINA;
    }

    if (this.dead) {
      this.pelvis.position.y = THREE.MathUtils.damp(this.pelvis.position.y, 0.3, 10, dt);
      this.pelvis.rotation.x = THREE.MathUtils.damp(this.pelvis.rotation.x, -Math.PI * 0.46, 10, dt);
      return;
    }

    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.dodgeTimer > 0) this.dodgeTimer -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.takedownTimer > 0) this.takedownTimer = Math.max(0, this.takedownTimer - dt);
    if (input.jumpBufferedTimer > 0) input.jumpBufferedTimer -= dt;

    if (this.takedownTimer > 0) {
      input.attackQueued = false;
      input.dodgeQueued = false;
      input.jumpBufferedTimer = 0;
      this.sprintingFlag = false;
      this.movingFlag = false;
      this.crouching = true;
      this.stance = 'ATTACK';
      this.root.rotation.y = this.facingYaw;
      this.applyAnimations(dt, elapsed, 0, input);
      return;
    }

    // Movement vector relative to third-person camera yaw
    const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moveZ = (input.backward ? 1 : 0) - (input.forward ? 1 : 0);
    const hasMove = activeControl && (moveX !== 0 || moveZ !== 0);

    // Camera forward on XZ plane is (-sin(yaw), -cos(yaw)); right is (cos(yaw), -sin(yaw))
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    _v3a.set(0, 0, 0);
    if (hasMove) {
      _v3a.x = moveX * cosY + moveZ * sinY;
      _v3a.z = -moveX * sinY + moveZ * cosY;
      _v3a.normalize();
    }

    // Trigger Dodge Roll (Q) — costs stamina & grants brief invulnerability
    if (
      activeControl &&
      input.dodgeQueued &&
      this.dodgeCooldown <= 0 &&
      this.dodgeTimer <= 0 &&
      this.stamina >= CONFIG.DODGE_STAMINA_COST
    ) {
      input.dodgeQueued = false;
      this.spendStamina(CONFIG.DODGE_STAMINA_COST);
      this.dodgeTimer = CONFIG.DODGE_DURATION;
      this.dodgeCooldown = CONFIG.DODGE_COOLDOWN;
      this.invulnTimer = CONFIG.DODGE_INVULN_DURATION;
      this.attackTimer = 0;
      if (hasMove) {
        this.dodgeDir.copy(_v3a);
      } else {
        this.dodgeDir.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
      }
      this.facingYaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
      this.spawnDustPuff(6, 1.5);
      audio.playThud(145, 0.14);
    } else {
      input.dodgeQueued = false;
    }

    // Trigger Vel Spear Attack (Left Click) — costs stamina & respects cooldown
    if (
      activeControl &&
      input.attackQueued &&
      this.attackTimer <= 0 &&
      this.attackCooldown <= 0 &&
      this.dodgeTimer <= 0 &&
      this.stamina >= CONFIG.ATTACK_STAMINA_COST
    ) {
      input.attackQueued = false;
      this.spendStamina(CONFIG.ATTACK_STAMINA_COST);
      this.attackTimer = CONFIG.ATTACK_DURATION;
      this.attackCooldown = CONFIG.ATTACK_COOLDOWN;
      this.attackCameraPunch = 0.32;
      // Face camera forward when attacking
      this.facingYaw = Math.atan2(-sinY, -cosY);
      this.onAttackStarted?.();
      audio.playSpearWhoosh();
    } else {
      input.attackQueued = false;
    }

    // Shield Block SFX edge trigger
    const blocking =
      activeControl && input.block && this.dodgeTimer <= 0 && this.attackTimer <= 0;
    if (blocking && !this.wasBlocking) {
      audio.playShieldGuard();
    }
    this.wasBlocking = blocking;

    const canSprint =
      hasMove &&
      input.sprint &&
      !blocking &&
      !input.sneak &&
      this.dodgeTimer <= 0 &&
      this.attackTimer <= 0 &&
      this.stamina > 0.5;

    // Horizontal Velocity & Facing
    let horizSpeed = 0;
    if (this.dodgeTimer > 0) {
      const t = this.dodgeTimer / CONFIG.DODGE_DURATION;
      const spd = CONFIG.DODGE_SPEED * (0.45 + 0.55 * t);
      this.position.x += this.dodgeDir.x * spd * dt;
      this.position.z += this.dodgeDir.z * spd * dt;
      horizSpeed = spd;
    } else if (this.attackTimer > 0) {
      // Subtle forward lunge during early thrust frames
      const p = 1 - this.attackTimer / CONFIG.ATTACK_DURATION;
      if (p < 0.42) {
        const lunge = 4.2 * (1 - p / 0.42);
        this.position.x += Math.sin(this.facingYaw) * lunge * dt;
        this.position.z += Math.cos(this.facingYaw) * lunge * dt;
      }
      horizSpeed = 1.2;
    } else if (hasMove) {
      let targetSpeed: number = CONFIG.WALK_SPEED;
      if (blocking) {
        targetSpeed = CONFIG.BLOCK_SPEED;
      } else if (input.sneak) {
        targetSpeed = CONFIG.SNEAK_SPEED;
      } else if (canSprint) {
        targetSpeed = CONFIG.SPRINT_SPEED;
        this.spendStamina(CONFIG.SPRINT_STAMINA_DRAIN * dt);
      }

      const devMult = devOptions?.speedBoost ? 2.5 : 1.0;
      const moveSpeed = targetSpeed * devMult;
      this.position.x += _v3a.x * moveSpeed * dt;
      this.position.z += _v3a.z * moveSpeed * dt;
      horizSpeed = targetSpeed;

      const desiredYaw = blocking
        ? Math.atan2(-sinY, -cosY)
        : Math.atan2(_v3a.x, _v3a.z);
      let deltaYaw = desiredYaw - this.facingYaw;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      this.facingYaw += deltaYaw * (1 - Math.exp(-13 * dt));
    } else if (blocking) {
      const desiredYaw = Math.atan2(-sinY, -cosY);
      let deltaYaw = desiredYaw - this.facingYaw;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      this.facingYaw += deltaYaw * (1 - Math.exp(-12 * dt));
    }

    // Apply decaying combat knockback
    if (this.knockbackVel.lengthSq() > 0.001) {
      this.position.x += this.knockbackVel.x * dt;
      this.position.z += this.knockbackVel.z * dt;
      this.knockbackVel.multiplyScalar(Math.max(0, 1 - dt * 10));
    }

    // Resolve horizontal obstacle & world perimeter collisions (bypassed in No Barriers Dev Mode)
    if (!devOptions?.noBarriers) {
      this.resolveCollisions(colliders, useWorldClamp);
    }

    // Vertical Physics (Jump with Coyote Time, or Free 3D Flight in No Barriers Mode)
    const groundY = groundHeightFn(this.position.x, this.position.z);
    if (devOptions?.noBarriers) {
      const flySpeed = 9.5 * (devOptions.speedBoost ? 2.5 : 1.0);
      if (activeControl) {
        if (input.jumpHeld) this.position.y += flySpeed * dt;
        if (input.sneak) this.position.y -= flySpeed * dt;
      }
      this.velocityY = 0;
      this.grounded = this.position.y <= groundY + 0.14 && !input.jumpHeld;
      input.jumpBufferedTimer = 0;
    } else {
      if (this.grounded) {
        this.coyoteTimer = CONFIG.COYOTE_TIME;
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }

      if (
        activeControl &&
        input.jumpBufferedTimer > 0 &&
        this.coyoteTimer > 0 &&
        this.dodgeTimer <= 0
      ) {
        this.velocityY = CONFIG.JUMP_VELOCITY;
        this.grounded = false;
        this.coyoteTimer = 0;
        input.jumpBufferedTimer = 0;
        this.spawnDustPuff(4, 1.0);
        audio.playThud(160, 0.1);
      }

      this.velocityY += CONFIG.GRAVITY * dt;
      this.position.y += this.velocityY * dt;

      if (this.position.y <= groundY) {
        if (!this.grounded && this.velocityY < -5.5) {
          this.landSquash = 0.22;
          this.spawnDustPuff(5, 1.2);
          audio.playThud(95, 0.15);
        }
        this.position.y = groundY;
        this.velocityY = 0;
        this.grounded = true;
      } else if (this.position.y > groundY + 0.14) {
        this.grounded = false;
      }
    }

    // Determine Current Stance & Stealth Movement Flags
    this.crouching = activeControl && input.sneak && this.grounded && !blocking && this.dodgeTimer <= 0 && this.attackTimer <= 0;
    this.sprintingFlag = canSprint;
    this.movingFlag = hasMove;

    if (this.dodgeTimer > 0) this.stance = 'DODGE';
    else if (this.attackTimer > 0) this.stance = 'ATTACK';
    else if (!this.grounded) this.stance = 'AIR';
    else if (blocking) this.stance = 'BLOCK';
    else if (this.crouching) this.stance = 'SNEAK';
    else if (canSprint) this.stance = 'SPRINT';
    else if (hasMove) this.stance = 'WALK';
    else this.stance = 'IDLE';

    // Regenerate stamina when idle (slower while walking), paused during actions
    if (
      activeControl &&
      !canSprint &&
      this.attackTimer <= 0 &&
      this.dodgeTimer <= 0 &&
      !blocking
    ) {
      if (this.staminaRegenTimer > 0) {
        this.staminaRegenTimer = Math.max(0, this.staminaRegenTimer - dt);
      } else {
        const regenRate = hasMove
          ? CONFIG.STAMINA_REGEN_WALK
          : CONFIG.STAMINA_REGEN_IDLE;
        this.stamina = Math.min(
          CONFIG.PLAYER_MAX_STAMINA,
          this.stamina + regenRate * dt
        );
      }
    }

    // Footstep Audio & Sprint Dust
    if (this.grounded && hasMove && this.dodgeTimer <= 0 && this.attackTimer <= 0) {
      const stepInterval = canSprint ? 0.29 : input.sneak ? 0.56 : 0.42;
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = stepInterval;
        audio.playFootstep(canSprint, input.sneak);
        if (canSprint) this.spawnDustPuff(2, 0.65);
      }
    } else {
      this.footstepTimer = 0.08;
    }

    // Apply Root Rotation & Grounded Contact Shadow
    this.root.rotation.y = this.facingYaw;
    const heightAboveGround = Math.max(0, this.position.y - groundY);
    this.contactShadow.position.set(
      this.position.x,
      groundY + 0.04,
      this.position.z
    );
    const shadowScale = Math.max(0.45, 1 - heightAboveGround * 0.14);
    this.contactShadow.scale.setScalar(shadowScale);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.72 * shadowScale;

    // ------------------------------------------------------------------------
    // Procedural Character Animations (Idle, Walk, Sprint, Sneak, Jump, Attack, Block, Dodge)
    // ------------------------------------------------------------------------
    this.applyAnimations(dt, elapsed, horizSpeed, input);
  }

  private applyAnimations(
    dt: number,
    elapsed: number,
    horizSpeed: number,
    input: InputState
  ): void {
    const isMoving = horizSpeed > 0.3 && this.grounded && this.dodgeTimer <= 0;
    const isSprinting = this.stance === 'SPRINT';
    const isSneaking = this.stance === 'SNEAK';

    const cycleSpeed = isSprinting ? 13.5 : isSneaking ? 5.6 : 8.8;
    if (isMoving) {
      this.animTime += dt * cycleSpeed;
    }
    this.moveBlend = THREE.MathUtils.damp(
      this.moveBlend,
      isMoving ? 1 : 0,
      12,
      dt
    );

    const stride = Math.sin(this.animTime) * this.moveBlend;
    const strideCos = Math.cos(this.animTime) * this.moveBlend;
    const idleBreath = Math.sin(elapsed * 2.1);

    // Default neutral targets
    let pelvisY = 0.94 - this.landSquash * 0.35;
    let pelvisRotX = 0;
    let torsoRotX = 0;
    let torsoRotY = 0;
    let headRotX = 0;

    let lHipX = 0;
    let rHipX = 0;
    let lKneeX = 0;
    let rKneeX = 0;

    let lShX = 0.18;
    let lShZ = 0.14;
    let lForX = -0.35;

    let rShX = -0.22;
    let rShZ = -0.14;
    let rForX = -0.45;

    // 1. Locomotion (Idle / Walk / Sprint / Sneak)
    if (isMoving) {
      const legAmp = isSprinting ? 0.95 : isSneaking ? 0.48 : 0.65;
      const bounce = isSprinting ? 0.1 : isSneaking ? 0.03 : 0.06;
      pelvisY += Math.abs(strideCos) * bounce - (isSneaking ? 0.18 : 0);
      torsoRotX = isSprinting ? 0.28 : isSneaking ? 0.36 : 0.1;
      torsoRotY = -stride * (isSprinting ? 0.24 : 0.12);

      lHipX = stride * legAmp;
      rHipX = -stride * legAmp;
      lKneeX = Math.max(0, -strideCos * legAmp * 1.15) + (isSneaking ? 0.38 : 0.08);
      rKneeX = Math.max(0, strideCos * legAmp * 1.15) + (isSneaking ? 0.38 : 0.08);

      // Arms swing with shield & vel held naturally
      lShX = -stride * (isSprinting ? 0.62 : 0.38) - (isSneaking ? 0.25 : 0);
      rShX = stride * (isSprinting ? 0.52 : 0.3) - (isSprinting ? 0.45 : 0.15);
      rForX = isSprinting ? -0.68 : -0.45;
      lForX = isSneaking ? -0.75 : -0.42;
    } else if (this.grounded) {
      // Alive warrior idle stance
      pelvisY += idleBreath * 0.018 - (input.sneak ? 0.16 : 0);
      torsoRotX = input.sneak ? 0.3 : 0.04 + idleBreath * 0.02;
      torsoRotY = -0.18;
      lShX = -0.22 + idleBreath * 0.03;
      lShZ = 0.22;
      lForX = -0.58;
      rShX = -0.18 - idleBreath * 0.03;
      rShZ = -0.16;
      rForX = -0.36;
      if (input.sneak) {
        lHipX = -0.32;
        rHipX = -0.32;
        lKneeX = 0.58;
        rKneeX = 0.58;
      }
    }

    // 2. Airborne Jump Pose
    if (!this.grounded && this.dodgeTimer <= 0) {
      const rising = this.velocityY > 0;
      torsoRotX = rising ? 0.16 : 0.06;
      lHipX = rising ? -0.55 : -0.25;
      rHipX = rising ? 0.32 : -0.15;
      lKneeX = rising ? 0.85 : 0.45;
      rKneeX = rising ? 0.35 : 0.25;
      lShX = -0.55;
      rShX = -0.85;
      rForX = -0.3;
    }

    // 3. Shield Block Pose (Right Click)
    if (this.stance === 'BLOCK') {
      torsoRotY = 0.36;
      torsoRotX = 0.14;
      lShX = -1.08;
      lShZ = -0.48;
      lForX = -0.72;
      rShX = 0.35;
      rShZ = -0.26;
      rForX = -0.92;
    }

    // 4. Vel Spear Attack Thrust (Left Click)
    const slashMat = this.slashArc.material as THREE.MeshBasicMaterial;
    if (this.attackTimer > 0) {
      const p = 1 - this.attackTimer / CONFIG.ATTACK_DURATION;
      if (p < 0.25) {
        // Quick coil wind-up
        const k = p / 0.25;
        torsoRotY = -0.55 * k;
        rShX = 0.55 * k;
        rForX = -0.95;
        lShX = -0.45;
      } else {
        // Explosive forward Vel thrust
        const k = Math.sin(((p - 0.25) / 0.75) * Math.PI);
        torsoRotY = 0.52 * k;
        torsoRotX = 0.26 * k;
        rShX = -1.48 * k;
        rShZ = 0.18 * k;
        rForX = -0.12;
        lShX = 0.35 * k;
      }
      // Brief golden spear arc flash
      const arcVis = p > 0.22 && p < 0.68 ? Math.sin(((p - 0.22) / 0.46) * Math.PI) : 0;
      slashMat.opacity = arcVis * 0.62;
      this.slashArc.scale.setScalar(0.85 + p * 0.45);
      this.slashArc.rotation.z = -0.4 + p * 0.9;
    } else {
      slashMat.opacity = 0;
    }

    // 5. Dodge Roll Tumble (Q)
    if (this.dodgeTimer > 0) {
      const p = 1 - this.dodgeTimer / CONFIG.DODGE_DURATION;
      pelvisY = 0.58 + Math.sin(p * Math.PI) * 0.28;
      pelvisRotX = p * Math.PI * 2;
      torsoRotX = 0.55;
      lHipX = -0.9;
      rHipX = -0.9;
      lKneeX = 1.2;
      rKneeX = 1.2;
      lShX = -0.7;
      rShX = -0.7;
    }

    // 6. Silent Takedown Sequence (E behind unaware/suspicious mummy)
    if (this.takedownTimer > 0) {
      const p = 1 - this.takedownTimer / CONFIG.STEALTH_TAKEDOWN_DURATION;
      const strike = Math.sin(p * Math.PI);
      pelvisY = 0.78;
      torsoRotX = 0.34 * strike;
      torsoRotY = 0.52 * strike;
      lHipX = -0.45 * strike;
      rHipX = 0.35 * strike;
      lKneeX = 0.45;
      rShX = -1.55 * strike;
      rForX = -0.15;
      lShX = -0.5;
      lForX = -0.7;
      const slashMatTd = this.slashArc.material as THREE.MeshBasicMaterial;
      slashMatTd.opacity = strike * 0.35;
      this.slashArc.scale.setScalar(0.75 + p * 0.3);
    }

    // Smoothly damp joints for weighty PS2 action-adventure feel
    const dampRate = this.dodgeTimer > 0 || this.attackTimer > 0 ? 22 : 14;
    this.pelvis.position.y = THREE.MathUtils.damp(this.pelvis.position.y, pelvisY, dampRate, dt);
    this.pelvis.rotation.x = this.dodgeTimer > 0 ? pelvisRotX : THREE.MathUtils.damp(this.pelvis.rotation.x, 0, 18, dt);

    this.torso.rotation.x = THREE.MathUtils.damp(this.torso.rotation.x, torsoRotX, dampRate, dt);
    this.torso.rotation.y = THREE.MathUtils.damp(this.torso.rotation.y, torsoRotY, dampRate, dt);
    this.headGroup.rotation.x = THREE.MathUtils.damp(this.headGroup.rotation.x, headRotX - torsoRotX * 0.4, dampRate, dt);

    this.leftHip.rotation.x = THREE.MathUtils.damp(this.leftHip.rotation.x, lHipX, dampRate, dt);
    this.rightHip.rotation.x = THREE.MathUtils.damp(this.rightHip.rotation.x, rHipX, dampRate, dt);
    this.leftKnee.rotation.x = THREE.MathUtils.damp(this.leftKnee.rotation.x, lKneeX, dampRate, dt);
    this.rightKnee.rotation.x = THREE.MathUtils.damp(this.rightKnee.rotation.x, rKneeX, dampRate, dt);

    this.leftShoulder.rotation.x = THREE.MathUtils.damp(this.leftShoulder.rotation.x, lShX, dampRate, dt);
    this.leftShoulder.rotation.z = THREE.MathUtils.damp(this.leftShoulder.rotation.z, lShZ, dampRate, dt);
    this.leftForearm.rotation.x = THREE.MathUtils.damp(this.leftForearm.rotation.x, lForX, dampRate, dt);

    this.rightShoulder.rotation.x = THREE.MathUtils.damp(this.rightShoulder.rotation.x, rShX, dampRate, dt);
    this.rightShoulder.rotation.z = THREE.MathUtils.damp(this.rightShoulder.rotation.z, rShZ, dampRate, dt);
    this.rightForearm.rotation.x = THREE.MathUtils.damp(this.rightForearm.rotation.x, rForX, dampRate, dt);

    // Desert wind secondary motion on Vel crimson streamers, sash, and flowing hair
    const windStrength = 0.25 + Math.min(horizSpeed * 0.08, 0.75);
    this.velStreamers.forEach((s, i) => {
      s.rotation.z = Math.sin(elapsed * 5.2 + i * 1.4) * windStrength * 0.45 + 0.22;
      s.rotation.x = Math.cos(elapsed * 4.4 + i) * windStrength * 0.3;
    });
    this.sashTail.rotation.x = Math.sin(elapsed * 3.8) * 0.14 + Math.min(horizSpeed * 0.05, 0.45);
    this.hairBack.rotation.x = 0.15 + Math.sin(elapsed * 4.5) * 0.08 + Math.min(horizSpeed * 0.04, 0.32);

    // Subtle squash-and-stretch on landing
    const sy = 1 - this.landSquash * 0.4;
    const sxz = 1 + this.landSquash * 0.22;
    this.root.scale.set(sxz, sy, sxz);
  }
}

/* ============================================================================
 * 5B. ENEMY MODULE (EnemySystem — 3 Low-Poly Cursed Mummies)
 * ==========================================================================*/

type MummyAwareness = 'unaware' | 'suspicious' | 'alert';
type MummyAiState = 'wander' | 'investigate' | 'chase' | 'attack' | 'dead';

interface MummyDebris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface MummyEntity {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  hpBarGroup: THREE.Group;
  hpFill: THREE.Mesh;
  statusIcon: THREE.Mesh;
  statusIconMat: THREE.MeshBasicMaterial;
  flashMaterials: Array<{ mat: THREE.MeshStandardMaterial; baseEmissive: number }>;
  debrisTemplates: Array<{
    mesh: THREE.Mesh;
    size: [number, number, number];
    mat: THREE.MeshStandardMaterial;
  }>;
  home: THREE.Vector3;
  patrol: Array<{ x: number; z: number }>;
  patrolIdx: number;
  patrolPause: number;
  lastKnownPos: THREE.Vector3;
  detection: number;
  awareness: MummyAwareness;
  searchTimer: number;
  loseSightTimer: number;
  health: number;
  maxHealth: number;
  aiState: MummyAiState;
  swingTimer: number;
  swingDidHit: boolean;
  cooldownTimer: number;
  hitFlashTimer: number;
  knockbackVel: THREE.Vector3;
  animTime: number;
  alive: boolean;
}

class EnemySystem {
  private desertMummies: MummyEntity[] = [];
  private tombMummies: MummyEntity[] = [];
  private mummies: MummyEntity[] = [];
  private realm: 'desert' | 'tomb' = 'desert';
  private debris: MummyDebris[] = [];

  constructor(
    private scene: THREE.Scene,
    private textures: TextureLibrary
  ) {
    this.reset();
  }

  public getMummies(): MummyEntity[] {
    return this.mummies;
  }

  public setRealm(nextRealm: 'desert' | 'tomb'): void {
    this.realm = nextRealm;
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
    }
    this.debris = [];

    for (const m of this.desertMummies) {
      m.root.visible = nextRealm === 'desert' && m.alive;
      if (nextRealm !== 'desert') m.statusIcon.visible = false;
    }
    for (const m of this.tombMummies) {
      m.root.visible = nextRealm === 'tomb' && m.alive;
      if (nextRealm !== 'tomb') m.statusIcon.visible = false;
    }
    this.mummies =
      nextRealm === 'desert' ? this.desertMummies : this.tombMummies;
  }

  public reset(): void {
    this.clearAll();
    CONFIG.MUMMY_SPAWNS.forEach((sp, idx) => {
      const patrol = CONFIG.MUMMY_PATROLS[idx] ?? [sp];
      this.desertMummies.push(this.createMummy(sp, patrol, groundHeightAt));
    });

    const tombGuards: Array<{
      spawn: { x: number; z: number };
      patrol: ReadonlyArray<{ x: number; z: number }>;
    }> = [
      {
        spawn: { x: 0.5, z: -36.5 },
        patrol: [
          { x: -3.0, z: -32.0 },
          { x: 4.0, z: -40.5 },
        ],
      },
      {
        spawn: { x: 0.0, z: -76.0 },
        patrol: [
          { x: -6.5, z: -76.0 },
          { x: 6.5, z: -76.0 },
        ],
      },
    ];
    tombGuards.forEach((g) => {
      const m = this.createMummy(g.spawn, g.patrol, tombGroundHeightAt);
      m.root.visible = false;
      this.tombMummies.push(m);
    });

    this.realm = 'desert';
    this.mummies = this.desertMummies;
  }

  private clearAll(): void {
    for (const m of this.desertMummies) {
      this.scene.remove(m.root);
    }
    for (const m of this.tombMummies) {
      this.scene.remove(m.root);
    }
    this.desertMummies = [];
    this.tombMummies = [];
    this.mummies = [];
    for (const d of this.debris) {
      this.scene.remove(d.mesh);
    }
    this.debris = [];
  }

  private createMummy(
    spawn: { x: number; z: number },
    patrolPoints: ReadonlyArray<{ x: number; z: number }>,
    heightFn: (x: number, z: number) => number = groundHeightAt
  ): MummyEntity {
    const root = new THREE.Group();
    const startY = heightFn(spawn.x, spawn.z);
    root.position.set(spawn.x, startY, spawn.z);
    root.rotation.y = Math.random() * Math.PI * 2;

    const bandageMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.bandage,
        color: 0xe6d6ad,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const darkWrapMat = applyPs2VertexWobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.bandage,
        color: 0x8d7956,
        roughness: 0.92,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffb830,
      emissive: 0xff4c12,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });

    const flashMaterials = [
      { mat: bandageMat, baseEmissive: bandageMat.emissive.getHex() },
      { mat: darkWrapMat, baseEmissive: darkWrapMat.emissive.getHex() },
    ];

    const pelvis = new THREE.Group();
    pelvis.position.y = 0.9;
    root.add(pelvis);

    const hipsMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.24, 0.28),
      darkWrapMat
    );
    hipsMesh.castShadow = true;
    pelvis.add(hipsMesh);

    const loinStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.44, 0.05),
      darkWrapMat
    );
    loinStrip.position.set(0, -0.22, 0.14);
    pelvis.add(loinStrip);

    const torso = new THREE.Group();
    torso.position.y = 0.14;
    pelvis.add(torso);

    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.2, 0.54, 7),
      bandageMat
    );
    chest.position.y = 0.25;
    chest.scale.set(1.08, 1.0, 0.8);
    chest.castShadow = true;
    torso.add(chest);

    const shoulderStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.42, 0.04),
      darkWrapMat
    );
    shoulderStrip.position.set(-0.25, 0.24, -0.08);
    shoulderStrip.rotation.z = 0.24;
    torso.add(shoulderStrip);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.56;
    torso.add(headGroup);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.31, 0.27),
      bandageMat
    );
    head.position.y = 0.16;
    head.castShadow = true;
    headGroup.add(head);

    const eyeBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, 0.04),
      darkWrapMat
    );
    eyeBand.position.set(0, 0.19, 0.13);
    headGroup.add(eyeBand);

    const leftEye = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.035, 0.04),
      eyeMat
    );
    leftEye.position.set(0.065, 0.19, 0.145);
    const rightEye = leftEye.clone();
    rightEye.position.x = -0.065;
    headGroup.add(leftEye, rightEye);

    const makeLimb = (
      w: number,
      h: number,
      d: number,
      mat: THREE.MeshStandardMaterial,
      px: number,
      py: number
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.y = -h * 0.46;
      mesh.castShadow = true;
      pivot.add(mesh);
      return { pivot, mesh };
    };

    const leftArm = makeLimb(0.125, 0.56, 0.125, bandageMat, 0.32, 0.44);
    const rightArm = makeLimb(0.125, 0.56, 0.125, bandageMat, -0.32, 0.44);
    torso.add(leftArm.pivot, rightArm.pivot);

    const leftLeg = makeLimb(0.155, 0.78, 0.155, darkWrapMat, 0.13, -0.06);
    const rightLeg = makeLimb(0.155, 0.78, 0.155, darkWrapMat, -0.13, -0.06);
    pelvis.add(leftLeg.pivot, rightLeg.pivot);

    // Subtle 3D health bar above mummy (appears once damaged)
    const hpBarGroup = new THREE.Group();
    hpBarGroup.position.y = 2.18;
    hpBarGroup.visible = false;
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x1a0b06, side: THREE.DoubleSide })
    );
    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xd9382e, side: THREE.DoubleSide })
    );
    hpFill.position.z = 0.01;
    hpBarGroup.add(hpBg, hpFill);
    root.add(hpBarGroup);

    // Overhead awareness icon ("?" Suspicious, "!" Alert)
    const statusIconMat = new THREE.MeshBasicMaterial({
      map: this.textures.alertQuestion,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const statusIcon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.48),
      statusIconMat
    );
    statusIcon.position.y = 2.52;
    statusIcon.visible = false;
    root.add(statusIcon);

    this.scene.add(root);

    return {
      root,
      pelvis,
      torso,
      headGroup,
      leftArm: leftArm.pivot,
      rightArm: rightArm.pivot,
      leftLeg: leftLeg.pivot,
      rightLeg: rightLeg.pivot,
      hpBarGroup,
      hpFill,
      statusIcon,
      statusIconMat,
      flashMaterials,
      debrisTemplates: [
        { mesh: head, size: [0.27, 0.31, 0.27], mat: bandageMat },
        { mesh: chest, size: [0.4, 0.52, 0.34], mat: bandageMat },
        { mesh: leftArm.mesh, size: [0.125, 0.54, 0.125], mat: bandageMat },
        { mesh: rightArm.mesh, size: [0.125, 0.54, 0.125], mat: bandageMat },
        { mesh: leftLeg.mesh, size: [0.155, 0.68, 0.155], mat: darkWrapMat },
        { mesh: rightLeg.mesh, size: [0.155, 0.68, 0.155], mat: darkWrapMat },
      ],
      home: new THREE.Vector3(spawn.x, startY, spawn.z),
      patrol: patrolPoints.map((p) => ({ x: p.x, z: p.z })),
      patrolIdx: 0,
      patrolPause: 0.6 + Math.random() * 1.2,
      lastKnownPos: new THREE.Vector3(spawn.x, startY, spawn.z),
      detection: 0,
      awareness: 'unaware',
      searchTimer: 0,
      loseSightTimer: 0,
      health: CONFIG.MUMMY_MAX_HEALTH,
      maxHealth: CONFIG.MUMMY_MAX_HEALTH,
      aiState: 'wander',
      swingTimer: 0,
      swingDidHit: false,
      cooldownTimer: 0,
      hitFlashTimer: 0,
      knockbackVel: new THREE.Vector3(),
      animTime: Math.random() * 6,
      alive: true,
    };
  }

  private spawnBreakApartDebris(mummy: MummyEntity): void {
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    mummy.root.updateMatrixWorld(true);

    for (const part of mummy.debrisTemplates) {
      part.mesh.getWorldPosition(tmpPos);
      part.mesh.getWorldQuaternion(tmpQuat);

      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
        part.mat
      );
      chunk.position.copy(tmpPos);
      chunk.quaternion.copy(tmpQuat);
      chunk.castShadow = true;
      this.scene.add(chunk);

      const ox = tmpPos.x - mummy.root.position.x + (Math.random() - 0.5) * 0.5;
      const oz = tmpPos.z - mummy.root.position.z + (Math.random() - 0.5) * 0.5;
      const len = Math.hypot(ox, oz) || 1;
      const spd = 2.0 + Math.random() * 2.8;

      this.debris.push({
        mesh: chunk,
        vel: new THREE.Vector3(
          (ox / len) * spd,
          2.8 + Math.random() * 2.8,
          (oz / len) * spd
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        ),
        life: 0,
        maxLife: 4.5,
      });
    }
  }

  public silentKillMummy(mummy: MummyEntity): void {
    if (!mummy.alive) return;
    mummy.health = 0;
    mummy.alive = false;
    mummy.awareness = 'unaware';
    mummy.aiState = 'dead';
    mummy.detection = 0;
    mummy.statusIcon.visible = false;
    mummy.root.visible = false;
    this.spawnBreakApartDebris(mummy);
  }

  public damageMummy(
    mummy: MummyEntity,
    amount: number,
    knockDir: THREE.Vector3,
    audio: AudioManager,
    attackerPos: THREE.Vector3
  ): void {
    if (!mummy.alive) return;
    mummy.health = Math.max(0, mummy.health - amount);
    mummy.hitFlashTimer = CONFIG.HIT_FLASH_DURATION;

    mummy.hpBarGroup.visible = true;
    const ratio = Math.max(0.001, mummy.health / mummy.maxHealth);
    mummy.hpFill.scale.x = ratio;
    mummy.hpFill.position.x = -(1 - ratio) * 0.4;

    mummy.knockbackVel.set(
      knockDir.x * CONFIG.MUMMY_KNOCKBACK_SPEED,
      0,
      knockDir.z * CONFIG.MUMMY_KNOCKBACK_SPEED
    );

    // Direct spear hit immediately alerts the mummy
    mummy.detection = 1.0;
    mummy.awareness = 'alert';
    mummy.lastKnownPos.copy(attackerPos);
    if (mummy.aiState !== 'attack') {
      mummy.aiState = 'chase';
    }

    if (mummy.health <= 0) {
      mummy.alive = false;
      mummy.aiState = 'dead';
      mummy.statusIcon.visible = false;
      mummy.root.visible = false;
      this.spawnBreakApartDebris(mummy);
      audio.playMummyCrumble();
    }
  }

  private resolveCollisions(
    pos: THREE.Vector3,
    colliders: WorldCollider[],
    useWorldClamp = true
  ): void {
    const r = CONFIG.MUMMY_COLLIDER_RADIUS;
    for (let i = 0; i < colliders.length; i++) {
      const col = colliders[i];
      if (pos.y > col.maxY || pos.y + 1.8 < col.minY) continue;
      if (col.type === 'cylinder') {
        const dx = pos.x - col.x;
        const dz = pos.z - col.z;
        const dSq = dx * dx + dz * dz;
        const minD = r + col.radius;
        if (dSq < minD * minD && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          pos.x += (dx / d) * (minD - d);
          pos.z += (dz / d) * (minD - d);
        }
      } else {
        const cx = THREE.MathUtils.clamp(pos.x, col.minX, col.maxX);
        const cz = THREE.MathUtils.clamp(pos.z, col.minZ, col.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq < r * r && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        }
      }
    }
    if (useWorldClamp) {
      const dist = Math.hypot(pos.x, pos.z);
      if (dist > CONFIG.WORLD_PLAY_RADIUS) {
        const s = CONFIG.WORLD_PLAY_RADIUS / dist;
        pos.x *= s;
        pos.z *= s;
      }
    }
  }

  public update(
    dt: number,
    player: PlayerController,
    cameraPos: THREE.Vector3,
    world: Pick<WorldData, 'colliders' | 'shadowZones' | 'losOccluders'>,
    stealth: StealthSystem,
    audio: AudioManager,
    activeControl: boolean,
    onPlayerStrike: (damage: number, attackerPos: THREE.Vector3) => void,
    groundHeightFn: (x: number, z: number) => number = groundHeightAt,
    useWorldClamp = true
  ): void {
    const colliders = world.colliders;
    const profile = stealth.getPlayerProfile(player, world);

    // Update break-apart debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life += dt;
      if (d.life >= d.maxLife) {
        this.scene.remove(d.mesh);
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.y -= 18 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;

      const gy = groundHeightFn(d.mesh.position.x, d.mesh.position.z) + 0.12;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy;
        d.vel.y *= -0.3;
        d.vel.x *= 0.65;
        d.vel.z *= 0.65;
        d.rotVel.multiplyScalar(0.55);
      }
      if (d.life > d.maxLife - 1.0) {
        d.mesh.scale.setScalar(Math.max(0.01, d.maxLife - d.life));
      }
    }

    for (const m of this.mummies) {
      if (!m.alive) continue;
      m.animTime += dt;

      if (m.hitFlashTimer > 0) {
        m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);
        const flash = m.hitFlashTimer > 0 ? 0xff4522 : null;
        m.flashMaterials.forEach(({ mat, baseEmissive }) => {
          mat.emissive.setHex(flash !== null ? flash : baseEmissive);
        });
      }

      if (m.hpBarGroup.visible) {
        m.hpBarGroup.lookAt(cameraPos);
      }
      if (m.statusIcon.visible) {
        m.statusIcon.lookAt(cameraPos);
      }

      if (m.knockbackVel.lengthSq() > 0.001) {
        m.root.position.x += m.knockbackVel.x * dt;
        m.root.position.z += m.knockbackVel.z * dt;
        m.knockbackVel.multiplyScalar(Math.max(0, 1 - dt * 8.5));
      }

      if (m.cooldownTimer > 0) {
        m.cooldownTimer = Math.max(0, m.cooldownTimer - dt);
      }

      const toPX = player.position.x - m.root.position.x;
      const toPZ = player.position.z - m.root.position.z;
      const dist = Math.hypot(toPX, toPZ);

      // Update Stealth Perception & Awareness State
      if (!activeControl || player.dead) {
        m.awareness = 'unaware';
        m.aiState = 'wander';
        m.detection = 0;
        m.swingTimer = 0;
      } else {
        const sense = stealth.evaluateMummyPerception(m, player, profile, world);
        if (sense.canSee || sense.canHear) {
          m.lastKnownPos.copy(player.position);
          m.loseSightTimer = 0;

          const effRange = Math.max(1.0, sense.effectiveVisionRange);
          const closeness = Math.max(0.28, 1.35 - dist / effRange);
          const stanceRate = profile.sneaking
            ? 0.52
            : profile.sprinting
            ? 1.65
            : 1.0;
          const shadowRate = profile.inShadow
            ? profile.sneaking
              ? 0.42
              : 0.65
            : 1.0;
          const hearBoost = sense.canHear && !sense.canSee ? 0.85 : 1.0;
          m.detection = Math.min(
            1.0,
            m.detection +
              CONFIG.STEALTH_DETECT_BUILD_RATE *
                closeness *
                stanceRate *
                shadowRate *
                hearBoost *
                dt
          );

          if (m.detection >= CONFIG.STEALTH_ALERT_THRESHOLD) {
            if (m.awareness !== 'alert') {
              m.awareness = 'alert';
              if (m.aiState !== 'attack') m.aiState = 'chase';
              audio.playMummyGroan();
            }
          } else if (m.detection >= CONFIG.STEALTH_SUSPICIOUS_THRESHOLD) {
            if (m.awareness === 'unaware') {
              m.awareness = 'suspicious';
              m.aiState = 'investigate';
              m.searchTimer = CONFIG.STEALTH_SEARCH_DURATION;
            }
          }
        } else {
          if (m.awareness === 'alert') {
            m.loseSightTimer += dt;
            if (
              m.loseSightTimer >= CONFIG.STEALTH_ALERT_LOSE_DELAY ||
              dist > CONFIG.MUMMY_LOSE_RANGE
            ) {
              m.awareness = 'suspicious';
              m.aiState = 'investigate';
              m.detection = 0.72;
              m.searchTimer = CONFIG.STEALTH_SEARCH_DURATION;
              m.swingTimer = 0;
            }
          } else if (m.awareness === 'suspicious') {
            // Drain awareness when player is hidden or out of sight
            m.detection = Math.max(
              0,
              m.detection - CONFIG.STEALTH_DETECT_DRAIN_RATE * dt
            );
            if (m.detection <= 0.01 && m.searchTimer <= 0) {
              m.detection = 0;
              m.awareness = 'unaware';
              m.aiState = 'wander';
            }
          } else {
            m.detection = Math.max(
              0,
              m.detection - CONFIG.STEALTH_DETECT_DRAIN_RATE * dt
            );
          }
        }
      }

      // Sync overhead "?" / "!" icon
      if (m.awareness === 'alert') {
        m.statusIcon.visible = true;
        m.statusIconMat.map = this.textures.alertExclaim;
      } else if (m.awareness === 'suspicious') {
        m.statusIcon.visible = true;
        m.statusIconMat.map = this.textures.alertQuestion;
      } else {
        m.statusIcon.visible = false;
      }

      let moveSpeed = 0;
      let targetYaw = m.root.rotation.y;
      let turnRate = 6.5;

      if (m.aiState === 'attack') {
        targetYaw = Math.atan2(toPX, toPZ);
        m.swingTimer += dt;
        if (!m.swingDidHit && m.swingTimer >= CONFIG.MUMMY_ATTACK_WINDUP) {
          m.swingDidHit = true;
          if (dist <= CONFIG.MUMMY_ATTACK_RANGE + 0.45) {
            onPlayerStrike(CONFIG.MUMMY_DAMAGE, m.root.position);
          }
        }
        if (m.swingTimer >= CONFIG.MUMMY_ATTACK_DURATION) {
          m.swingTimer = 0;
          m.swingDidHit = false;
          m.cooldownTimer = CONFIG.MUMMY_ATTACK_COOLDOWN;
          m.aiState = m.awareness === 'alert' ? 'chase' : 'investigate';
        }
      } else if (m.aiState === 'chase') {
        targetYaw = Math.atan2(toPX, toPZ);
        if (dist <= CONFIG.MUMMY_ATTACK_RANGE && m.cooldownTimer <= 0) {
          m.aiState = 'attack';
          m.swingTimer = 0;
          m.swingDidHit = false;
          audio.playMummyGroan();
        } else if (dist > CONFIG.MUMMY_ATTACK_RANGE * 0.78) {
          moveSpeed = CONFIG.MUMMY_MOVE_SPEED;
        }
      } else if (m.aiState === 'investigate') {
        // Suspicious (?): move to last known position, then scan around
        const lx = m.lastKnownPos.x - m.root.position.x;
        const lz = m.lastKnownPos.z - m.root.position.z;
        const distLast = Math.hypot(lx, lz);
        if (distLast > 1.05) {
          targetYaw = Math.atan2(lx, lz);
          moveSpeed = CONFIG.MUMMY_WANDER_SPEED * 1.25;
          turnRate = 4.2;
        } else {
          m.searchTimer = Math.max(0, m.searchTimer - dt);
          targetYaw = m.root.rotation.y + Math.sin(m.animTime * 2.1) * 0.85;
          turnRate = 2.4;
          if (m.searchTimer <= 0 && m.detection < CONFIG.STEALTH_SUSPICIOUS_THRESHOLD) {
            m.awareness = 'unaware';
            m.aiState = 'wander';
            m.detection = 0;
          }
        }
      } else {
        // Unaware patrol along ruin waypoints
        const wp = m.patrol[m.patrolIdx];
        const wx = wp.x - m.root.position.x;
        const wz = wp.z - m.root.position.z;
        if (Math.hypot(wx, wz) > 0.75) {
          targetYaw = Math.atan2(wx, wz);
          moveSpeed = CONFIG.MUMMY_WANDER_SPEED;
        } else {
          m.patrolPause -= dt;
          if (m.patrolPause <= 0) {
            m.patrolIdx = (m.patrolIdx + 1) % m.patrol.length;
            m.patrolPause = 1.4 + Math.random() * 1.3;
          }
        }
      }

      if (moveSpeed > 0) {
        m.root.position.x += Math.sin(targetYaw) * moveSpeed * dt;
        m.root.position.z += Math.cos(targetYaw) * moveSpeed * dt;
      }

      let deltaYaw = targetYaw - m.root.rotation.y;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      m.root.rotation.y += deltaYaw * Math.min(1, dt * turnRate);

      this.resolveCollisions(m.root.position, colliders, useWorldClamp);
      m.root.position.y = groundHeightFn(m.root.position.x, m.root.position.z);

      this.animateMummy(m, moveSpeed > 0);
    }
  }

  private animateMummy(m: MummyEntity, isMoving: boolean): void {
    const t = m.animTime;
    if (m.aiState === 'attack') {
      const p = m.swingTimer / CONFIG.MUMMY_ATTACK_DURATION;
      const windupFrac = CONFIG.MUMMY_ATTACK_WINDUP / CONFIG.MUMMY_ATTACK_DURATION;
      let armAngle: number;
      let torsoLean: number;
      if (p < windupFrac) {
        const w = p / windupFrac;
        armAngle = -1.35 - w * 1.15;
        torsoLean = -0.15 * w;
      } else {
        const s = (p - windupFrac) / (1 - windupFrac);
        const slam = Math.sin(Math.min(1, s * 1.6) * (Math.PI / 2));
        armAngle = -2.5 + slam * 1.85;
        torsoLean = -0.15 + slam * 0.45;
      }
      m.torso.rotation.x = torsoLean;
      m.leftArm.rotation.set(armAngle, 0, -0.12);
      m.rightArm.rotation.set(armAngle, 0, 0.12);
      m.leftLeg.rotation.x = -0.15;
      m.rightLeg.rotation.x = 0.2;
      return;
    }

    const freq = isMoving ? 5.2 : 2.1;
    const swing = Math.sin(t * freq);
    m.pelvis.position.y =
      0.9 + (isMoving ? Math.abs(Math.cos(t * freq)) * 0.05 : 0);
    m.torso.rotation.x = 0.18 + Math.sin(t * 2.0) * 0.04;
    m.torso.rotation.z = isMoving ? swing * 0.09 : Math.sin(t * 1.4) * 0.05;
    m.headGroup.rotation.z = Math.sin(t * 1.7) * 0.12;
    m.leftArm.rotation.set(-1.35 + swing * 0.18, 0, -0.1);
    m.rightArm.rotation.set(-1.35 - swing * 0.18, 0, 0.1);
    m.leftLeg.rotation.x = isMoving ? swing * 0.55 : 0;
    m.rightLeg.rotation.x = isMoving ? -swing * 0.55 : 0;
  }
}

/* ============================================================================
 * 5C. COMBAT MODULE (CombatSystem — Spear Hitbox, Shield Block, Dodge I-Frames)
 * ==========================================================================*/

class CombatSystem {
  private hitThisSwing = new Set<MummyEntity>();
  private fwd = new THREE.Vector3();
  private hitCenter = new THREE.Vector3();
  private knockDir = new THREE.Vector3();

  public onPlayerAttackStart(): void {
    this.hitThisSwing.clear();
  }

  public reset(): void {
    this.hitThisSwing.clear();
  }

  public getSpearHitCenter(player: PlayerController): THREE.Vector3 {
    this.fwd.set(Math.sin(player.facingYaw), 0, Math.cos(player.facingYaw));
    return this.hitCenter
      .copy(player.position)
      .addScaledVector(this.fwd, CONFIG.SPEAR_RANGE * 0.55);
  }

  public update(
    player: PlayerController,
    enemies: EnemySystem,
    camera: ThirdPersonCamera,
    audio: AudioManager
  ): void {
    if (player.dead || !player.isAttackHitActive()) return;

    this.fwd.set(Math.sin(player.facingYaw), 0, Math.cos(player.facingYaw));
    this.hitCenter
      .copy(player.position)
      .addScaledVector(this.fwd, CONFIG.SPEAR_RANGE * 0.55);

    for (const m of enemies.getMummies()) {
      if (!m.alive || this.hitThisSwing.has(m)) continue;

      const distTip = Math.hypot(
        m.root.position.x - this.hitCenter.x,
        m.root.position.z - this.hitCenter.z
      );
      const distPlayer = Math.hypot(
        m.root.position.x - player.position.x,
        m.root.position.z - player.position.z
      );

      if (
        distTip <= CONFIG.SPEAR_HIT_RADIUS ||
        distPlayer <= CONFIG.SPEAR_RANGE * 0.5
      ) {
        this.hitThisSwing.add(m);
        this.knockDir.set(
          m.root.position.x - player.position.x,
          0,
          m.root.position.z - player.position.z
        );
        if (this.knockDir.lengthSq() > 0.0001) this.knockDir.normalize();
        else this.knockDir.copy(this.fwd);

        enemies.damageMummy(
          m,
          CONFIG.SPEAR_DAMAGE,
          this.knockDir,
          audio,
          player.position
        );
        audio.playHitImpact(false);
        camera.addShake(CONFIG.CAM_SHAKE_LIGHT);
      }
    }
  }

  public damagePlayer(
    rawDamage: number,
    attackerPos: THREE.Vector3,
    player: PlayerController,
    camera: ThirdPersonCamera,
    audio: AudioManager,
    onHitFlash: (blocked: boolean) => void,
    onFallen: () => void,
    godMode = false
  ): void {
    if (player.dead || player.isInvulnerable() || godMode) return;

    this.knockDir.set(
      player.position.x - attackerPos.x,
      0,
      player.position.z - attackerPos.z
    );
    if (this.knockDir.lengthSq() > 0.0001) this.knockDir.normalize();

    const canBlock = player.isBlocking() && player.stamina > 0;
    if (canBlock) {
      const reduced = Math.max(
        1,
        Math.round(rawDamage * CONFIG.BLOCK_DAMAGE_MULT)
      );
      player.spendStamina(CONFIG.BLOCK_STAMINA_COST);
      player.applyDamage(reduced, this.knockDir, true);
      audio.playShieldBlockHit();
      onHitFlash(true);
      camera.addShake(CONFIG.CAM_SHAKE_LIGHT);
    } else {
      player.applyDamage(rawDamage, this.knockDir, false);
      audio.playHitImpact(true);
      onHitFlash(false);
      camera.addShake(CONFIG.CAM_SHAKE_HEAVY);
    }

    if (player.dead) {
      onFallen();
    }
  }
}

/* ============================================================================
 * 5D. STEALTH MODULE (StealthSystem — Vision, Shadows, Noise & Takedowns)
 * ==========================================================================*/

interface PlayerStealthProfile {
  inShadow: boolean;
  sneaking: boolean;
  sprinting: boolean;
  moving: boolean;
  visibilityMult: number;
  noiseMult: number;
}

class StealthSystem {
  private losRaycaster = new THREE.Raycaster();
  private eyeOrigin = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private losDir = new THREE.Vector3();
  private halfConeCos = Math.cos(
    ((CONFIG.STEALTH_VISION_ANGLE_DEG * 0.5) * Math.PI) / 180
  );

  public isInShadow(pos: THREE.Vector3, shadowZones: ShadowZone[]): boolean {
    for (let i = 0; i < shadowZones.length; i++) {
      const sz = shadowZones[i];
      if (Math.hypot(pos.x - sz.x, pos.z - sz.z) <= sz.radius) {
        return true;
      }
    }
    return false;
  }

  public hasLineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    losOccluders: THREE.Object3D[]
  ): boolean {
    this.losDir.subVectors(to, from);
    const dist = this.losDir.length();
    if (dist < 0.1) return true;
    this.losDir.divideScalar(dist);

    this.losRaycaster.set(from, this.losDir);
    this.losRaycaster.near = 0.15;
    this.losRaycaster.far = dist - 0.18;
    const hits = this.losRaycaster.intersectObjects(losOccluders, false);
    return hits.length === 0;
  }

  public getPlayerProfile(
    player: PlayerController,
    world: Pick<WorldData, 'shadowZones' | 'losOccluders'>
  ): PlayerStealthProfile {
    const inShadow = this.isInShadow(player.position, world.shadowZones);
    const sneaking = player.isSneaking();
    const sprinting = player.isSprinting();
    const moving = player.isMoving();

    let visibilityMult = 1.0;
    if (inShadow && sneaking) {
      visibilityMult = CONFIG.STEALTH_SHADOW_SNEAK_MULT;
    } else if (sneaking) {
      visibilityMult = CONFIG.STEALTH_SNEAK_DETECT_MULT;
    } else if (inShadow) {
      visibilityMult = sprinting
        ? CONFIG.STEALTH_SHADOW_VISIBILITY_MULT * 1.25
        : CONFIG.STEALTH_SHADOW_VISIBILITY_MULT;
    } else if (sprinting) {
      visibilityMult = CONFIG.STEALTH_SPRINT_DETECT_MULT;
    }

    let noiseMult = 0;
    if (moving) {
      if (sneaking) noiseMult = CONFIG.STEALTH_SNEAK_NOISE_MULT;
      else if (sprinting) noiseMult = CONFIG.STEALTH_SPRINT_NOISE_MULT;
      else noiseMult = 1.0;
    }

    return {
      inShadow,
      sneaking,
      sprinting,
      moving,
      visibilityMult,
      noiseMult,
    };
  }

  public evaluateMummyPerception(
    mummy: MummyEntity,
    player: PlayerController,
    profile: PlayerStealthProfile,
    world: Pick<WorldData, 'shadowZones' | 'losOccluders'>
  ): { canSee: boolean; canHear: boolean; effectiveVisionRange: number } {
    const effectiveVisionRange =
      CONFIG.STEALTH_VISION_RANGE * profile.visibilityMult;

    const dx = player.position.x - mummy.root.position.x;
    const dz = player.position.z - mummy.root.position.z;
    const dist = Math.hypot(dx, dz);

    // Hearing radius scaled by movement noise (silent when still or hidden)
    const hearingRange = CONFIG.STEALTH_HEARING_RADIUS * profile.noiseMult;
    const canHear =
      profile.noiseMult > 0 &&
      dist <= hearingRange &&
      !(profile.inShadow && profile.sneaking && dist > 1.3);

    // Vision cone + line-of-sight raycast blocked by walls, columns, & dunes
    let canSee = false;
    const properlyHidden =
      profile.inShadow && profile.sneaking && dist > 3.2;

    if (!properlyHidden && dist <= effectiveVisionRange && dist > 0.01) {
      const fwdX = Math.sin(mummy.root.rotation.y);
      const fwdZ = Math.cos(mummy.root.rotation.y);
      const dot = (fwdX * dx + fwdZ * dz) / dist;

      if (dot >= this.halfConeCos || mummy.awareness === 'alert') {
        this.eyeOrigin.set(
          mummy.root.position.x,
          mummy.root.position.y + 1.58,
          mummy.root.position.z
        );
        this.targetPos.set(
          player.position.x,
          player.position.y + (profile.sneaking ? 0.92 : 1.38),
          player.position.z
        );
        canSee = this.hasLineOfSight(
          this.eyeOrigin,
          this.targetPos,
          world.losOccluders
        );
      }
    }

    return { canSee, canHear, effectiveVisionRange };
  }

  public findTakedownTarget(
    player: PlayerController,
    enemies: EnemySystem
  ): MummyEntity | null {
    if (player.dead || player.isTakedownActive()) return null;

    let best: MummyEntity | null = null;
    let bestDist: number = CONFIG.STEALTH_TAKEDOWN_RANGE;

    for (const m of enemies.getMummies()) {
      if (!m.alive || m.awareness === 'alert') continue;
      const dx = player.position.x - m.root.position.x;
      const dz = player.position.z - m.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist || dist < 0.1) continue;

      const fwdX = Math.sin(m.root.rotation.y);
      const fwdZ = Math.cos(m.root.rotation.y);
      const dot = (fwdX * dx + fwdZ * dz) / dist;
      if (dot <= CONFIG.STEALTH_TAKEDOWN_BEHIND_DOT) {
        bestDist = dist;
        best = m;
      }
    }
    return best;
  }

  public executeTakedown(
    target: MummyEntity,
    player: PlayerController,
    enemies: EnemySystem,
    audio: AudioManager
  ): void {
    player.startTakedown(target.root.position);
    enemies.silentKillMummy(target);
    audio.playStealthTakedown();
  }

  public getHudState(
    player: PlayerController,
    enemies: EnemySystem,
    world: Pick<WorldData, 'shadowZones' | 'losOccluders'>
  ): StealthHudState {
    const inShadow = this.isInShadow(player.position, world.shadowZones);
    const sneaking = player.isSneaking();
    let maxLevel = 0;
    let hasAlert = false;
    let hasSuspicious = false;

    for (const m of enemies.getMummies()) {
      if (!m.alive) continue;
      if (m.detection > maxLevel) maxLevel = m.detection;
      if (m.awareness === 'alert') hasAlert = true;
      else if (m.awareness === 'suspicious') hasSuspicious = true;
    }

    let status: StealthStatus = 'unseen';
    if (hasAlert) status = 'alert';
    else if (hasSuspicious || maxLevel >= 0.15) status = 'suspicious';
    else if (inShadow && (sneaking || maxLevel < 0.05)) status = 'hidden';

    return {
      level: maxLevel,
      status,
      inShadow,
      canTakedown: this.findTakedownTarget(player, enemies) !== null,
    };
  }
}

/* ============================================================================
 * 6. CAMERA MODULE (Third-Person Orbit Camera + Wall & Terrain Collision)
 * ==========================================================================*/

class ThirdPersonCamera {
  public yaw = 0; // 0 looks toward -Z (directly toward the Waystone & distant Pyramid)
  public pitch = 0.24;

  private currentDist: number = CONFIG.CAM_DEFAULT_DIST;
  private smoothedTarget = new THREE.Vector3(0, 1.5, 4);
  private raycaster = new THREE.Raycaster();
  private shakeIntensity = 0;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.raycaster.near = 0.1;
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(0.5, Math.max(this.shakeIntensity, amount));
  }

  public reset(): void {
    this.yaw = 0;
    this.pitch = 0.24;
    this.currentDist = CONFIG.CAM_DEFAULT_DIST;
    this.shakeIntensity = 0;
    this.smoothedTarget.set(0, 1.5, 4);
  }

  public addLookDelta(dx: number, dy: number): void {
    this.yaw -= dx * CONFIG.CAM_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * CONFIG.CAM_SENSITIVITY,
      CONFIG.CAM_PITCH_MIN,
      CONFIG.CAM_PITCH_MAX
    );
  }

  /**
   * Slow cinematic title-screen camera showcasing the Tamil explorer,
   * ancient Aytham Waystone, ruins, and the Great Pyramid in golden haze.
   */
  public updateTitleOrbit(dt: number, elapsed: number, playerPos: THREE.Vector3): void {
    const angle = Math.sin(elapsed * 0.16) * 0.52 + 0.38;
    const radius = 6.2;
    const desiredX = playerPos.x + Math.sin(angle) * radius;
    const desiredZ = playerPos.z + Math.cos(angle) * radius;
    const desiredY =
      Math.max(playerPos.y + 2.25, groundHeightAt(desiredX, desiredZ) + 1.2);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, desiredX, 3.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, desiredY, 3.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, desiredZ, 3.5, dt);

    // Frame the explorer in the right-center while revealing the distant Pyramid
    _v3b.set(playerPos.x - 0.5, playerPos.y + 1.65, playerPos.z - 2.2);
    this.camera.lookAt(_v3b);
  }

  public snapToPlayer(player: PlayerController): void {
    this.smoothedTarget.set(
      player.position.x,
      player.position.y + 1.55,
      player.position.z
    );
    this.currentDist = CONFIG.CAM_DEFAULT_DIST;
  }

  /**
   * Gameplay third-person camera with raycast wall collision + terrain floor clamp
   * so the player is always clearly visible and the camera never clips into walls.
   */
  public updateGameplay(
    dt: number,
    player: PlayerController,
    occluders: THREE.Object3D[],
    groundHeightFn: (x: number, z: number) => number = groundHeightAt,
    noClip = false
  ): void {
    const targetDist =
      player.stance === 'BLOCK'
        ? CONFIG.CAM_BLOCK_DIST
        : player.stance === 'SPRINT'
        ? CONFIG.CAM_SPRINT_DIST
        : CONFIG.CAM_DEFAULT_DIST;

    // Anchor pivot at explorer's upper back / shoulders
    _camOrigin.set(
      player.position.x,
      player.position.y + (player.stance === 'SNEAK' ? 1.25 : 1.55),
      player.position.z
    );

    this.smoothedTarget.x = THREE.MathUtils.damp(this.smoothedTarget.x, _camOrigin.x, 14, dt);
    this.smoothedTarget.y = THREE.MathUtils.damp(this.smoothedTarget.y, _camOrigin.y, 12, dt);
    this.smoothedTarget.z = THREE.MathUtils.damp(this.smoothedTarget.z, _camOrigin.z, 14, dt);

    // Spherical offset behind player
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    _camRayDir.set(sinY * cosP, sinP, cosY * cosP).normalize();

    // Multi-feeler wall collision raycast (skipped in No Barriers Dev Mode)
    let safeDist: number = targetDist;
    if (!noClip) {
      _camSide.set(cosY, 0, -sinY);
      const feelerOffsets = [0, -0.28, 0.28];

      this.raycaster.far = targetDist + 0.35;
      for (let f = 0; f < feelerOffsets.length; f++) {
        _v3c.copy(this.smoothedTarget).addScaledVector(_camSide, feelerOffsets[f]);
        this.raycaster.set(_v3c, _camRayDir);
        const hits = this.raycaster.intersectObjects(occluders, false);
        if (hits.length > 0) {
          const clamped = Math.max(CONFIG.CAM_MIN_DIST, hits[0].distance - 0.38);
          if (clamped < safeDist) safeDist = clamped;
        }
      }
    }

    // Fast pull-in on obstruction; silky smooth recovery when clear
    const distRate = safeDist < this.currentDist ? 24 : 7;
    this.currentDist = THREE.MathUtils.damp(
      this.currentDist,
      safeDist,
      distRate,
      dt
    );

    // Apply subtle attack impact shake/punch & heavy combat camera shake
    const punch = player.attackCameraPunch;
    _camDesired
      .copy(this.smoothedTarget)
      .addScaledVector(_camRayDir, this.currentDist - punch * 0.45);

    if (this.shakeIntensity > 0.002) {
      _camDesired.x += (Math.random() - 0.5) * 2 * this.shakeIntensity;
      _camDesired.y += (Math.random() - 0.5) * 1.6 * this.shakeIntensity;
      _camDesired.z += (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeIntensity *= Math.max(0, 1 - dt * 11);
    } else {
      this.shakeIntensity = 0;
    }

    // Clamp above floor / terrain so camera never clips underground (skipped in No Barriers Dev Mode)
    if (!noClip) {
      const camGround = groundHeightFn(_camDesired.x, _camDesired.z) + 0.58;
      if (_camDesired.y < camGround) {
        _camDesired.y = camGround;
      }
    }

    // Slight vertical micro-kick on spear thrust
    _camDesired.y += punch * 0.08;

    this.camera.position.copy(_camDesired);

    // Keep player consistently framed slightly above center
    _v3d.set(
      this.smoothedTarget.x,
      this.smoothedTarget.y + 0.12,
      this.smoothedTarget.z
    );
    this.camera.lookAt(_v3d);
  }

  /** Dramatic camera focus during Anpu-Kar Boss Awakening sequence */
  public updateBossIntroOrbit(
    dt: number,
    bossFocus: THREE.Vector3
  ): void {
    const desiredX = bossFocus.x - 6.8;
    const desiredY = bossFocus.y + 1.85;
    const desiredZ = bossFocus.z + 4.4;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, desiredX, 4.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, desiredY, 4.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, desiredZ, 4.5, dt);
    this.camera.lookAt(bossFocus);
  }

  /** Heroic celebratory orbit when reclaiming the Crown of Korkai & Ra */
  public updateVictoryOrbit(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3
  ): void {
    const ang = elapsed * 0.45;
    const dx = playerPos.x - 3.6 + Math.sin(ang) * 1.1;
    const dz = playerPos.z + Math.cos(ang) * 3.8;
    const dy = playerPos.y + 2.25;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, dx, 3.8, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, dy, 3.8, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, dz, 3.8, dt);
    _v3b.set(playerPos.x, playerPos.y + 1.35, playerPos.z);
    this.camera.lookAt(_v3b);
  }
}

/* ============================================================================
 * 7. UI SUB-COMPONENTS (AKK ஃ Bespoke SVG Logo & HUD Elements)
 * ==========================================================================*/

function AkkLogoSvg({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      viewBox="0 0 360 175"
      className={compact ? 'w-20 h-10' : 'w-[300px] sm:w-[370px] h-auto'}
      aria-label="AKK Logo with Tamil Aytham Three-Dot Motif"
    >
      <defs>
        <linearGradient id="akkGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff3b8" />
          <stop offset="38%" stopColor="#f2be4a" />
          <stop offset="78%" stopColor="#c57d24" />
          <stop offset="100%" stopColor="#7a4412" />
        </linearGradient>
        <linearGradient id="akkGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f5c95c" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffe599" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f5c95c" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Radiant Sun-Eye Crest + Tamil ஃ (Aytham) Three-Dot Emblem */}
      <g transform="translate(180, 40)">
        {/* Horizon solar rays */}
        <line x1="-88" y1="6" x2="88" y2="6" stroke="url(#akkGlow)" strokeWidth="2" />
        {/* Stylized Egyptian Eye-of-Ra almond frame */}
        <path
          d="M -46 6 Q 0 -24 46 6 Q 0 32 -46 6 Z"
          fill="#241306"
          stroke="url(#akkGold)"
          strokeWidth="2.8"
        />
        {/* Sacred Tamil ஃ (Aytham) — Three Dots in Triangle inside the Eye */}
        <circle cx="0" cy="-3" r="4.6" fill="#ffe694" stroke="#854a12" strokeWidth="1.2" />
        <circle cx="-8.5" cy="11.5" r="4.6" fill="#ffe694" stroke="#854a12" strokeWidth="1.2" />
        <circle cx="8.5" cy="11.5" r="4.6" fill="#ffe694" stroke="#854a12" strokeWidth="1.2" />
      </g>

      {/* Sculpted AKK Wordmark */}
      <text
        x="180"
        y="132"
        textAnchor="middle"
        fill="url(#akkGold)"
        stroke="#331806"
        strokeWidth="3.5"
        paintOrder="stroke"
        style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontWeight: 900,
          fontSize: '78px',
          letterSpacing: '0.12em',
        }}
      >
        AKK
      </text>

      {/* Subtle Bottom Decorative Divider with Three Aytham Accent Dots */}
      <line x1="66" y1="150" x2="152" y2="150" stroke="#e4ae44" strokeWidth="1.5" opacity="0.7" />
      <circle cx="180" cy="146" r="2.6" fill="#f8d26b" />
      <circle cx="174.5" cy="153.5" r="2.6" fill="#f8d26b" />
      <circle cx="185.5" cy="153.5" r="2.6" fill="#f8d26b" />
      <line x1="208" y1="150" x2="294" y2="150" stroke="#e4ae44" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

function AythamIconSvg({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="6.5" r="3.2" fill="#f7ca5a" />
      <circle cx="6.5" cy="16.5" r="3.2" fill="#f7ca5a" />
      <circle cx="17.5" cy="16.5" r="3.2" fill="#f7ca5a" />
    </svg>
  );
}

function StealthEyeSvg({ status }: { status: StealthStatus }) {
  const color =
    status === 'alert'
      ? '#ff4a38'
      : status === 'suspicious'
      ? '#f2be48'
      : status === 'hidden'
      ? '#73d4c8'
      : '#e6b44c';

  return (
    <svg viewBox="0 0 32 20" className="w-6 h-4 shrink-0" aria-hidden="true">
      {status === 'hidden' ? (
        <>
          <path
            d="M 3 10 Q 16 16 29 10"
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <line x1="10" y1="13" x2="8" y2="16" stroke={color} strokeWidth="1.6" />
          <line x1="16" y1="14" x2="16" y2="17" stroke={color} strokeWidth="1.6" />
          <line x1="22" y1="13" x2="24" y2="16" stroke={color} strokeWidth="1.6" />
        </>
      ) : (
        <>
          <path
            d="M 2 10 Q 16 1 30 10 Q 16 19 2 10 Z"
            fill="#1b1006"
            stroke={color}
            strokeWidth="2"
          />
          <circle cx="16" cy="10" r={status === 'alert' ? 4.4 : 3.6} fill={color} />
        </>
      )}
    </svg>
  );
}

/* ============================================================================
 * 8. MAIN APPLICATION & GAME ENGINE LIFECYCLE
 * ==========================================================================*/

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<AudioManager | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const phaseRef = useRef<GamePhase>('title');

  const [volume, setVolume] = useState<number>(CONFIG.DEFAULT_BGM_VOLUME);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [hud, setHud] = useState<HudSnapshot>({
    stance: 'IDLE',
    headingDeg: 0,
    nearLandmark: null,
    pointerLocked: false,
    health: CONFIG.PLAYER_MAX_HEALTH,
    stamina: CONFIG.PLAYER_MAX_STAMINA,
    stealth: {
      level: 0,
      status: 'unseen',
      inShadow: false,
      canTakedown: false,
    },
    realm: 'desert',
    tomb: {
      artifacts: 0,
      maxArtifacts: 3,
      hasAnkhKey: false,
      puzzleASolved: false,
      puzzleBSolved: false,
      secretOpened: false,
    },
    boss: {
      active: false,
      awakening: false,
      defeated: false,
      name: 'ANPU-KAR · KEEPER OF THE SCALES',
      subtitle: 'PHASE I · THE GUARDIAN',
      health: 540,
      maxHealth: 540,
      phase: 1,
    },
  });
  const [hitFlash, setHitFlash] = useState<'none' | 'hurt' | 'block'>('none');
  const [transitionFade, setTransitionFade] = useState<boolean>(false);
  const [activeBanner, setActiveBanner] = useState<{
    text: string;
    tone: 'gold' | 'danger';
  } | null>(null);
  const retryHandlerRef = useRef<(() => void) | null>(null);
  const devActionRef = useRef<
    | ((
        action:
          | 'desert-plaza'
          | 'tomb-entrance'
          | 'toggle-tomb'
          | 'tomb-sanctuary'
          | 'tomb-treasury'
          | 'unlock-tomb'
      ) => void)
    | null
  >(null);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);
  const [devOptions, setDevOptions] = useState<DevModeOptions>({
    godMode: false,
    noBarriers: false,
    speedBoost: false,
  });
  const devOptionsRef = useRef<DevModeOptions>({
    godMode: false,
    noBarriers: false,
    speedBoost: false,
  });
  const toggleDevOption = useCallback((key: keyof DevModeOptions) => {
    setDevOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      devOptionsRef.current = next;
      return next;
    });
  }, []);
  const hitFlashTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const [activeInscription, setActiveInscription] = useState<{
    title: string;
    text: string;
  } | null>(null);

  const inscriptionTimerRef = useRef<number | null>(null);

  const showBanner = useCallback(
    (text: string, tone: 'gold' | 'danger' = 'gold') => {
      setActiveBanner({ text, tone });
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
      }
      bannerTimerRef.current = window.setTimeout(() => {
        setActiveBanner(null);
      }, 2400);
    },
    []
  );

  const triggerHitFlash = useCallback((blocked: boolean) => {
    setHitFlash(blocked ? 'block' : 'hurt');
    if (hitFlashTimerRef.current) {
      window.clearTimeout(hitFlashTimerRef.current);
    }
    hitFlashTimerRef.current = window.setTimeout(() => {
      setHitFlash('none');
    }, 140);
  }, []);

  const handleRetryGame = useCallback(() => {
    retryHandlerRef.current?.();
  }, []);

  // Sync phaseRef whenever React phase state changes
  const setGamePhase = useCallback((next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const showInscription = useCallback((title: string, text: string) => {
    setActiveInscription({ title, text });
    if (inscriptionTimerRef.current) {
      window.clearTimeout(inscriptionTimerRef.current);
    }
    inscriptionTimerRef.current = window.setTimeout(() => {
      setActiveInscription(null);
    }, 6500);
  }, []);

  const handleStartGame = useCallback(() => {
    audioRef.current?.startFromUserGesture();
    setGamePhase('playing');
    // Request pointer lock gently from the Start click gesture
    const mount = canvasMountRef.current;
    const canvas = mount?.querySelector('canvas');
    if (canvas && canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock();
      } catch {
        // Fallback drag-to-look remains active if iframe restricts pointer lock
      }
    }
  }, [setGamePhase]);

  const handleResume = useCallback(() => {
    audioRef.current?.startFromUserGesture();
    setGamePhase('playing');
    const canvas = canvasMountRef.current?.querySelector('canvas');
    if (canvas && canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock();
      } catch {
        // Ignore
      }
    }
  }, [setGamePhase]);

  const handleReturnToTitle = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    setActiveInscription(null);
    setGamePhase('title');
  }, [setGamePhase]);

  const handleVolumeChange = useCallback((next: number) => {
    setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
      audioRef.current?.setMuted(false);
    }
    audioRef.current?.setVolume(next);
  }, [muted]);

  const handleToggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const nextMuted = audioRef.current.toggleMute();
    setMuted(nextMuted);
  }, []);

  // --------------------------------------------------------------------------
  // Isolated Three.js WebGL Game Lifecycle (runs once on mount)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const audio = new AudioManager();
    audioRef.current = audio;

    // 1. Renderer (PS2 crisp low-res internal framebuffer upscaled via CSS)
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Sharp PS2 pixel edges
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(1); // Deliberate 1:1 low-res PS2 framebuffer
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    renderer.domElement.className = 'ps2-canvas';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Scene, Camera & Studio RoomEnvironment Reflections (for bronze/gold ornaments)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.12, 320);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 3. Build Procedural Textures, Desert World, Underground Tomb, Tamil Explorer, Enemies, Combat, Stealth & Camera
    const textures = createProceduralTextures();
    const world = buildWorld(scene, textures, isSoftwareGl);
    const tomb = new TombSystem(scene, isSoftwareGl);
    const player = new PlayerController(scene, textures);
    const enemies = new EnemySystem(scene, textures);
    const combat = new CombatSystem();
    const stealth = new StealthSystem();
    const thirdPersonCam = new ThirdPersonCamera(camera);

    let activeRealm: 'desert' | 'tomb' = 'desert';
    let isTransitioning = false;
    let transitionTimer: number | null = null;
    const savedDesertPos = new THREE.Vector3(12.0, groundHeightAt(12, -28), -28.0);
    let savedDesertYaw = Math.PI;
    let savedCamYaw = 0;
    let savedCamPitch = 0.24;

    const desertFogColor = new THREE.Color(PALETTE.FOG_COLOR);
    const tombFogColor = new THREE.Color(0x0b0705);

    const switchRealm = (nextRealm: 'desert' | 'tomb') => {
      if (isTransitioning || activeRealm === nextRealm) return;
      isTransitioning = true;
      clearHeldInputs();
      setActiveInscription(null);
      setTransitionFade(true);

      transitionTimer = window.setTimeout(() => {
        if (disposed) return;
        if (nextRealm === 'tomb') {
          savedDesertPos.copy(player.position);
          savedDesertYaw = player.facingYaw;
          savedCamYaw = thirdPersonCam.yaw;
          savedCamPitch = thirdPersonCam.pitch;

          world.group.visible = false;
          world.setLightsEnabled(false);
          tomb.group.visible = true;
          scene.background = tombFogColor;
          scene.fog = new THREE.FogExp2(0x0b0705, 0.036);
          enemies.setRealm('tomb');

          player.teleportTo(0, tombGroundHeightAt(0, 2.2), 2.2, Math.PI);
          thirdPersonCam.yaw = 0;
          thirdPersonCam.pitch = 0.22;
          thirdPersonCam.snapToPlayer(player);
          activeRealm = 'tomb';
          showBanner('ENTERED THE SUNKEN TOMB', 'gold');
        } else {
          tomb.group.visible = false;
          world.group.visible = true;
          world.setLightsEnabled(true);
          scene.background = desertFogColor;
          scene.fog = new THREE.FogExp2(PALETTE.FOG_COLOR, 0.0135);
          enemies.setRealm('desert');

          const rx = savedDesertPos.x;
          const rz = savedDesertPos.z;
          player.teleportTo(rx, groundHeightAt(rx, rz), rz, savedDesertYaw);
          thirdPersonCam.yaw = savedCamYaw;
          thirdPersonCam.pitch = savedCamPitch;
          thirdPersonCam.snapToPlayer(player);
          activeRealm = 'desert';
          showBanner('RETURNED TO DESERT RUINS', 'gold');
        }
        setTransitionFade(false);
        isTransitioning = false;
      }, 220);
    };

    player.setAttackCallback(() => {
      combat.onPlayerAttackStart();
      tomb.onPlayerAttackStart();
    });

    // Initial Title Camera framing
    camera.position.set(3.2, player.position.y + 2.3, player.position.z + 5.6);
    camera.lookAt(player.position.x, player.position.y + 1.5, player.position.z - 2);

    // Low-res PS2 Resize Handler (maintains exact viewport aspect ratio)
    const handleResize = () => {
      const vw = Math.max(1, container.clientWidth);
      const vh = Math.max(1, container.clientHeight);
      const aspect = vw / vh;
      const internalH = CONFIG.PS2_INTERNAL_HEIGHT;
      const internalW = Math.max(160, Math.round(internalH * aspect));

      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(internalW, internalH, false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Pre-warm shaders on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 4. Input Controller (WASD, Mouse Look, Shift, Space, Ctrl/C, LMB, RMB, Q, E, M, H, Esc)
    const input: InputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      sneak: false,
      block: false,
      jumpHeld: false,
      jumpBufferedTimer: 0,
      attackQueued: false,
      dodgeQueued: false,
    };

    let pointerLocked = false;
    let isDraggingLook = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const clearHeldInputs = () => {
      input.forward = false;
      input.backward = false;
      input.left = false;
      input.right = false;
      input.sprint = false;
      input.sneak = false;
      input.block = false;
      input.jumpHeld = false;
      isDraggingLook = false;
    };

    devActionRef.current = (action) => {
      if (isTransitioning) return;
      if (action === 'toggle-tomb') {
        audio.playTombTransition();
        switchRealm(activeRealm === 'desert' ? 'tomb' : 'desert');
        return;
      }
      if (action === 'unlock-tomb') {
        tomb.unlockAllDoors();
        audio.playPuzzleChime(3, true);
        showBanner('DEV: ALL TOMB DOORS UNLOCKED', 'gold');
        return;
      }
      const warpInDesert = (x: number, z: number, label: string) => {
        if (activeRealm !== 'desert') {
          tomb.group.visible = false;
          world.group.visible = true;
          world.setLightsEnabled(true);
          scene.background = desertFogColor;
          scene.fog = new THREE.FogExp2(PALETTE.FOG_COLOR, 0.0135);
          enemies.setRealm('desert');
          activeRealm = 'desert';
        }
        player.teleportTo(x, groundHeightAt(x, z), z, Math.PI);
        thirdPersonCam.snapToPlayer(player);
        showBanner(`DEV WARP: ${label}`, 'gold');
      };
      const warpInTomb = (x: number, z: number, label: string) => {
        if (activeRealm !== 'tomb') {
          savedDesertPos.copy(player.position);
          savedDesertYaw = player.facingYaw;
          world.group.visible = false;
          world.setLightsEnabled(false);
          tomb.group.visible = true;
          scene.background = tombFogColor;
          scene.fog = new THREE.FogExp2(0x0b0705, 0.036);
          enemies.setRealm('tomb');
          activeRealm = 'tomb';
        }
        player.teleportTo(x, tombGroundHeightAt(x, z), z, Math.PI);
        thirdPersonCam.yaw = 0;
        thirdPersonCam.snapToPlayer(player);
        showBanner(`DEV WARP: ${label}`, 'gold');
      };

      if (action === 'desert-plaza') warpInDesert(0, 4, 'DESERT PLAZA');
      else if (action === 'tomb-entrance') warpInDesert(12, -28, 'TOMB ENTRANCE');
      else if (action === 'tomb-sanctuary') warpInTomb(0, -64.5, 'INNER SANCTUARY');
      else if (action === 'tomb-treasury') warpInTomb(14.5, -73, 'GUARDIAN BOSS ARENA');
    };

    retryHandlerRef.current = () => {
      audio.startFromUserGesture();
      clearHeldInputs();
      if (transitionTimer) {
        clearTimeout(transitionTimer);
        transitionTimer = null;
      }
      isTransitioning = false;
      setTransitionFade(false);
      setActiveBanner(null);
      setActiveInscription(null);

      activeRealm = 'desert';
      tomb.group.visible = false;
      world.group.visible = true;
      world.setLightsEnabled(true);
      scene.background = desertFogColor;
      scene.fog = new THREE.FogExp2(PALETTE.FOG_COLOR, 0.0135);

      player.reset();
      enemies.reset();
      tomb.reset();
      combat.reset();
      thirdPersonCam.reset();
      setHitFlash('none');
      setHud((prev) => ({
        ...prev,
        stance: 'IDLE',
        health: CONFIG.PLAYER_MAX_HEALTH,
        stamina: CONFIG.PLAYER_MAX_STAMINA,
        realm: 'desert',
        tomb: tomb.getHudState(),
        boss: tomb.getBossHudState(),
        stealth: {
          level: 0,
          status: 'unseen',
          inShadow: false,
          canTakedown: false,
        },
      }));
      phaseRef.current = 'playing';
      setPhase('playing');
      try {
        renderer.domElement.requestPointerLock?.();
      } catch {
        // Drag look fallback remains active
      }
    };

    const findNearestLandmark = (): InteractableLandmark | null => {
      let best: InteractableLandmark | null = null;
      let bestDistSq = Infinity;
      for (let i = 0; i < world.interactables.length; i++) {
        const lm = world.interactables[i];
        const dSq = player.position.distanceToSquared(lm.position);
        if (dSq <= lm.radius * lm.radius && dSq < bestDistSq) {
          best = lm;
          bestDistSq = dSq;
        }
      }
      return best;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Title screen: Enter or Space starts the adventure & music
      if (phaseRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          audio.startFromUserGesture();
          phaseRef.current = 'playing';
          setPhase('playing');
          try {
            renderer.domElement.requestPointerLock?.();
          } catch {
            // Ignore
          }
        }
        return;
      }

      // Mute toggle works anytime after start
      if (e.code === 'KeyM' && !e.repeat) {
        const nextMuted = audio.toggleMute();
        setMuted(nextMuted);
        return;
      }

      // Toggle bottom dock
      if (e.code === 'KeyH' && !e.repeat) {
        setDockOpen((prev) => !prev);
        return;
      }

      // Developer Mode Menu (` or F9) & quick toggles (G God Mode, N No Barriers, V Speed, T Warp Realm)
      if ((e.code === 'Backquote' || e.code === 'F9') && !e.repeat) {
        e.preventDefault();
        setDevPanelOpen((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock?.();
          }
          return next;
        });
        return;
      }

      if (phaseRef.current === 'playing' && !e.repeat) {
        if (e.code === 'KeyG') {
          const nextVal = !devOptionsRef.current.godMode;
          toggleDevOption('godMode');
          showBanner(nextVal ? 'DEV: GOD MODE ON (NO DAMAGE)' : 'DEV: GOD MODE OFF', 'gold');
          return;
        }
        if (e.code === 'KeyN') {
          const nextVal = !devOptionsRef.current.noBarriers;
          toggleDevOption('noBarriers');
          showBanner(nextVal ? 'DEV: NO BARRIERS + FREE FLY ON' : 'DEV: NO BARRIERS OFF', 'gold');
          return;
        }
        if (e.code === 'KeyV') {
          const nextVal = !devOptionsRef.current.speedBoost;
          toggleDevOption('speedBoost');
          showBanner(nextVal ? 'DEV: 2.5X SPEED BOOST ON' : 'DEV: NORMAL SPEED', 'gold');
          return;
        }
        if (e.code === 'KeyT') {
          devActionRef.current?.('toggle-tomb');
          return;
        }
      }

      // Pause toggle (P or Escape when pointer is unlocked)
      if (e.code === 'KeyP' && !e.repeat) {
        if (phaseRef.current === 'playing') {
          clearHeldInputs();
          document.exitPointerLock?.();
          phaseRef.current = 'paused';
          setPhase('paused');
        } else if (phaseRef.current === 'paused') {
          phaseRef.current = 'playing';
          setPhase('playing');
        }
        return;
      }

      if (e.code === 'Escape' && !e.repeat) {
        if (phaseRef.current === 'paused') {
          phaseRef.current = 'playing';
          setPhase('playing');
        } else if (phaseRef.current === 'playing' && !pointerLocked) {
          clearHeldInputs();
          phaseRef.current = 'paused';
          setPhase('paused');
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          input.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          input.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          input.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          input.right = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          input.sprint = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
        case 'KeyC':
          input.sneak = true;
          break;
        case 'Space':
          e.preventDefault();
          input.jumpHeld = true;
          if (!e.repeat) input.jumpBufferedTimer = CONFIG.JUMP_BUFFER_TIME;
          break;
        case 'KeyQ':
          if (!e.repeat) input.dodgeQueued = true;
          break;
        case 'KeyE':
          if (!e.repeat && !isTransitioning) {
            const tdTarget = stealth.findTakedownTarget(player, enemies);
            if (tdTarget) {
              stealth.executeTakedown(tdTarget, player, enemies, audio);
              break;
            }
            if (activeRealm === 'tomb') {
              const outcome = tomb.triggerNearestInteraction(
                player.position,
                audio
              );
              if (outcome) {
                if (outcome.kind === 'exit-tomb') {
                  switchRealm('desert');
                } else if (outcome.kind === 'victory') {
                  if (outcome.healHealth || outcome.healStamina) {
                    player.healVitals(
                      outcome.healHealth ?? 0,
                      outcome.healStamina ?? 0
                    );
                  }
                  clearHeldInputs();
                  document.exitPointerLock?.();
                  audio.playVictoryFanfare();
                  phaseRef.current = 'victory';
                  setPhase('victory');
                  setHud((prev) => ({
                    ...prev,
                    tomb: tomb.getHudState(),
                    boss: tomb.getBossHudState(),
                  }));
                } else {
                  if (outcome.healHealth || outcome.healStamina) {
                    player.healVitals(
                      outcome.healHealth ?? 0,
                      outcome.healStamina ?? 0
                    );
                  }
                  if (outcome.banner) {
                    showBanner(outcome.banner, 'gold');
                  }
                  if (outcome.title && outcome.text) {
                    showInscription(outcome.title, outcome.text);
                  }
                }
              }
              break;
            }
            const lm = findNearestLandmark();
            if (lm) {
              if (lm.id === 'hidden-tomb-entrance') {
                audio.playTombTransition();
                switchRealm('tomb');
              } else {
                audio.playStoneResonance();
                showInscription(lm.title, lm.inscription);
              }
            } else {
              audio.playThud(190, 0.06);
              showInscription(
                'DESERT WIND',
                'Approach an ancient carved stele, gateway, obelisk, or crypt seal to inspect.'
              );
            }
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          input.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          input.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          input.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          input.right = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          input.sprint = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
        case 'KeyC':
          input.sneak = false;
          break;
        case 'Space':
          input.jumpHeld = false;
          break;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (phaseRef.current !== 'playing') return;
      // Ignore clicks on UI buttons/sliders
      if (e.target !== renderer.domElement) return;

      audio.startFromUserGesture();

      if (e.button === 0) {
        if (!pointerLocked) {
          try {
            renderer.domElement.requestPointerLock?.();
          } catch {
            // Drag look fallback still works
          }
        }
        input.attackQueued = true;
        isDraggingLook = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      } else if (e.button === 2) {
        input.block = true;
        isDraggingLook = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        input.block = false;
      }
      if (e.button === 0 || e.button === 2) {
        isDraggingLook = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== 'playing') return;
      if (pointerLocked) {
        // Clamp huge browser spikes on pointer lock entry
        const dx = THREE.MathUtils.clamp(e.movementX, -120, 120);
        const dy = THREE.MathUtils.clamp(e.movementY, -120, 120);
        thirdPersonCam.addLookDelta(dx, dy);
      } else if (isDraggingLook) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        thirdPersonCam.addLookDelta(dx * 1.4, dy * 1.4);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (e.target === renderer.domElement) {
        e.preventDefault();
      }
    };

    const onPointerLockChange = () => {
      pointerLocked = document.pointerLockElement === renderer.domElement;
      if (!pointerLocked) {
        input.block = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', clearHeldInputs);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // 5. Continuous Game Loop with Software-WebGL Pacing Guard
    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let hudSyncTimer = 0;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const currentPhase = phaseRef.current;

      if (currentPhase !== 'paused') {
        elapsed += dt;

        const inTomb = activeRealm === 'tomb';
        const activeColliders = inTomb ? tomb.colliders : world.colliders;
        const activeCamOccluders = inTomb
          ? tomb.cameraOccluders
          : world.cameraOccluders;
        const activeGroundFn = inTomb ? tombGroundHeightAt : groundHeightAt;
        const useWorldClamp = !inTomb;
        const activeStealthView = inTomb
          ? {
              colliders: tomb.colliders,
              shadowZones: tomb.shadowZones,
              losOccluders: tomb.losOccluders,
            }
          : world;

        const handlePlayerDamaged = (dmg: number, sourcePos: THREE.Vector3) => {
          combat.damagePlayer(
            dmg,
            sourcePos,
            player,
            thirdPersonCam,
            audio,
            triggerHitFlash,
            () => {
              clearHeldInputs();
              document.exitPointerLock?.();
              audio.playPlayerDeath();
              phaseRef.current = 'gameover';
              setPhase('gameover');
            },
            devOptionsRef.current.godMode
          );
        };

        const isBossIntro = inTomb && tomb.boss.state === 'awakening';
        const activePlayerControl =
          currentPhase === 'playing' && !isTransitioning && !isBossIntro;

        // Update player (idle animation runs smoothly even on Title Screen)
        player.update(
          dt,
          elapsed,
          input,
          thirdPersonCam.yaw,
          activeColliders,
          audio,
          activePlayerControl,
          activeGroundFn,
          useWorldClamp,
          devOptionsRef.current
        );

        // Update combat & Cursed Mummies (with Stealth perception & awareness)
        combat.update(player, enemies, thirdPersonCam, audio);
        if (inTomb && player.isAttackHitActive() && !player.dead) {
          tomb.checkPlayerAttack(
            player.position,
            combat.getSpearHitCenter(player),
            CONFIG.SPEAR_RANGE,
            CONFIG.SPEAR_HIT_RADIUS,
            CONFIG.SPEAR_DAMAGE,
            audio,
            () => thirdPersonCam.addShake(CONFIG.CAM_SHAKE_LIGHT)
          );
        }

        enemies.update(
          dt,
          player,
          camera.position,
          activeStealthView,
          stealth,
          audio,
          activePlayerControl,
          handlePlayerDamaged,
          activeGroundFn,
          useWorldClamp
        );

        // Update active realm environment (Desert Ruins or Underground Tomb traps/puzzles/boss)
        if (inTomb) {
          tomb.update(
            dt,
            elapsed,
            player.position,
            activePlayerControl || isBossIntro,
            audio,
            (dmg, srcPos, banner) => {
              if (currentPhase === 'playing' && !isTransitioning) {
                if (banner && !devOptionsRef.current.godMode) {
                  showBanner(banner, 'danger');
                }
                handlePlayerDamaged(dmg, srcPos);
              }
            },
            (amt) => thirdPersonCam.addShake(amt),
            (text, tone) => showBanner(text, tone)
          );
        } else {
          world.update(dt, elapsed, player.position);
        }

        // Update camera (handles Title, Boss Awakening intro, Victory ending orbit & Gameplay)
        if (currentPhase === 'title') {
          thirdPersonCam.updateTitleOrbit(dt, elapsed, player.position);
        } else if (currentPhase === 'victory') {
          thirdPersonCam.updateVictoryOrbit(dt, elapsed, player.position);
        } else if (isBossIntro) {
          thirdPersonCam.updateBossIntroOrbit(
            dt,
            tomb.boss.getCameraFocusPoint(_v3a)
          );
        } else {
          thirdPersonCam.updateGameplay(
            dt,
            player,
            activeCamOccluders,
            activeGroundFn,
            devOptionsRef.current.noBarriers
          );
        }

        // Throttled HUD snapshot update (10Hz) so React never slows the 3D loop
        hudSyncTimer += dt;
        if (currentPhase === 'playing' && hudSyncTimer >= 0.1) {
          hudSyncTimer = 0;
          const lm = inTomb ? tomb.getNearestPrompt(player.position) : findNearestLandmark();
          // Convert camera yaw to 0..359 compass heading where 0 = North (Pyramid)
          const rawDeg = ((-thirdPersonCam.yaw * 180) / Math.PI) % 360;
          const headingDeg = Math.round((rawDeg + 360) % 360);
          setHud({
            stance: player.stance,
            headingDeg,
            nearLandmark: lm ? { label: lm.label, title: lm.title } : null,
            pointerLocked,
            health: player.health,
            stamina: player.stamina,
            stealth: stealth.getHudState(player, enemies, activeStealthView),
            realm: activeRealm,
            tomb: tomb.getHudState(),
            boss: tomb.getBossHudState(),
          });
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    // 6. Clean Disposal on Unmount
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (inscriptionTimerRef.current) {
        clearTimeout(inscriptionTimerRef.current);
      }
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
      if (transitionTimer) {
        clearTimeout(transitionTimer);
      }
      if (hitFlashTimerRef.current) {
        clearTimeout(hitFlashTimerRef.current);
      }
      retryHandlerRef.current = null;
      devActionRef.current = null;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      audio.dispose();
      textures.dispose();
      tomb.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [showBanner, showInscription, toggleDevOption, triggerHitFlash]);

  // Compass cardinal label helper
  const cardinalLabel = (() => {
    const d = hud.headingDeg;
    if (d >= 338 || d < 23) return 'N · PYRAMID';
    if (d < 68) return 'NE';
    if (d < 113) return 'E · OBELISK';
    if (d < 158) return 'SE';
    if (d < 203) return 'S · DUNES';
    if (d < 248) return 'SW';
    if (d < 293) return 'W · GATE';
    return 'NW';
  })();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#1a1107] text-[#f5e3be]">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {/* Subtle PS2 CRT Scanline & Warm Sun Edge Vignette (pointer-events-none, no backdrop-filter) */}
      <div
        className="pointer-events-none absolute inset-0 retro-scanlines"
        style={{
          boxShadow: 'inset 0 0 90px rgba(24, 12, 3, 0.52)',
        }}
      />

      {/* Combat Hit / Block Screen Flash */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-100"
        style={{
          opacity: hitFlash === 'none' ? 0 : 1,
          background:
            hitFlash === 'block'
              ? 'radial-gradient(circle, rgba(240,190,77,0.05) 45%, rgba(240,190,77,0.36) 100%)'
              : 'radial-gradient(circle, rgba(210,38,28,0.08) 40%, rgba(210,38,28,0.52) 100%)',
        }}
      />

      {/* Desert <-> Underground Tomb Smooth Transition Fade */}
      <div
        className="pointer-events-none absolute inset-0 bg-[#080503] transition-opacity duration-200 z-40"
        style={{ opacity: transitionFade ? 1 : 0 }}
      />

      {/* =====================================================================
       * TITLE SCREEN OVERLAY
       * ===================================================================*/}
      {phase === 'title' && (
        <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-10">
          {/* Top-Left / Upper-Left Lockup leaving center-right clear for explorer & pyramid */}
          <div className="flex flex-col items-center sm:items-start mt-4 sm:mt-8 max-w-md">
            <div className="bg-[#1b1006]/75 border border-[#d6a042]/50 px-6 pt-4 pb-6 shadow-2xl flex flex-col items-center">
              <AkkLogoSvg />

              <button
                type="button"
                onClick={handleStartGame}
                className="mt-5 w-full sm:w-auto px-9 py-3 bg-[#c98828] hover:bg-[#e3a33a] active:bg-[#a86d1c] text-[#1c1005] font-bold tracking-[0.26em] text-sm uppercase border-2 border-[#ffe294] shadow-lg transition-colors cursor-pointer"
              >
                Press to Start
              </button>

              <p className="mt-3 text-[11px] tracking-[0.18em] text-[#d6b882]/85 uppercase">
                Click or Press Enter · Begins Music
              </p>
            </div>
          </div>

          {/* Flat Single Control-Hint Strip at Bottom */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#170e05]/80 border-t border-[#d6a042]/35 px-4 py-2.5 text-[11px] tracking-[0.14em] text-[#e7cf9e]">
            <div className="flex items-center gap-2">
              <AythamIconSvg className="w-4 h-4 shrink-0" />
              <span className="uppercase text-[#f3c563] font-semibold">
                AKK · Sunlit Desert Ruins
              </span>
            </div>
            <div className="uppercase opacity-90">
              WASD Move · Mouse Look · Shift Sprint · Space Jump · Ctrl/C Sneak · LMB Attack · RMB Block · Q Dodge · E Inspect · M Mute
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * IN-GAME HUD (Low-Occlusion, World Palette, Static Indicators)
       * ===================================================================*/}
      {phase !== 'title' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          {/* Top Perimeter Bar */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Minimal Emblem, Stance & Vital Bars */}
            <div className="flex flex-col gap-2">
              <div className="bg-[#1b1106]/82 border border-[#d6a042]/45 px-3.5 py-2 flex items-center gap-3">
                <AythamIconSvg className="w-5 h-5" />
                <div>
                  <div className="text-sm font-bold tracking-[0.22em] text-[#f5c85c] leading-none">
                    AKK
                  </div>
                  <div className="text-[10px] tracking-[0.2em] text-[#dcc292] mt-1 tabular-nums">
                    {hud.stance}
                  </div>
                </div>
              </div>

              <div className="w-52 bg-[#1b1106]/82 border border-[#d6a042]/45 px-3 py-2 flex flex-col gap-1.5 font-mono">
                <div>
                  <div className="flex justify-between text-[10px] tracking-[0.14em] text-[#f0d7a8]">
                    <span>HEALTH</span>
                    <span className="tabular-nums">
                      {Math.ceil(hud.health)} / {CONFIG.PLAYER_MAX_HEALTH}
                    </span>
                  </div>
                  <div className="mt-0.5 h-2.5 w-full bg-[#120904] border border-[#d6a042]/40 overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${Math.max(0, Math.min(100, (hud.health / CONFIG.PLAYER_MAX_HEALTH) * 100))}%`,
                        background: 'linear-gradient(90deg, #8b1a18, #d9382e)',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] tracking-[0.14em] text-[#f0d7a8]">
                    <span>STAMINA</span>
                    <span className="tabular-nums">
                      {Math.round(hud.stamina)} / {CONFIG.PLAYER_MAX_STAMINA}
                    </span>
                  </div>
                  <div className="mt-0.5 h-2 w-full bg-[#120904] border border-[#d6a042]/40 overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${Math.max(0, Math.min(100, (hud.stamina / CONFIG.PLAYER_MAX_STAMINA) * 100))}%`,
                        background: 'linear-gradient(90deg, #9a6d16, #ebc049)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Stealth Detection Eye Indicator */}
              <div className="w-52 bg-[#1b1106]/82 border border-[#d6a042]/45 px-3 py-2 flex items-center gap-2.5 font-mono">
                <StealthEyeSvg status={hud.stealth.status} />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] tracking-[0.12em]">
                    <span
                      style={{
                        color:
                          hud.stealth.status === 'alert'
                            ? '#ff6b57'
                            : hud.stealth.status === 'suspicious'
                            ? '#f4c75c'
                            : hud.stealth.status === 'hidden'
                            ? '#7ee0d4'
                            : '#e8d0a0',
                      }}
                    >
                      {hud.stealth.status === 'alert'
                        ? 'DETECTED!'
                        : hud.stealth.status === 'suspicious'
                        ? 'SUSPICIOUS ?'
                        : hud.stealth.status === 'hidden'
                        ? 'HIDDEN'
                        : 'UNSEEN'}
                    </span>
                    {hud.stealth.inShadow && (
                      <span className="px-1 bg-[#1e3a3d] border border-[#6ec7c0]/60 text-[9px] text-[#9ff3ea]">
                        SHADOW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-[#120904] border border-[#d6a042]/35 overflow-hidden">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${Math.max(0, Math.min(100, hud.stealth.level * 100))}%`,
                        background:
                          'linear-gradient(90deg, #d4a644, #e86b25, #d92b22)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Realm & Ancient Artifact Counter */}
              <div className="w-52 bg-[#1b1106]/82 border border-[#d6a042]/45 px-3 py-1.5 flex items-center justify-between text-[10px] tracking-[0.14em] font-mono">
                <span className="text-[#f3c563] uppercase">
                  {hud.realm === 'tomb' ? 'SUNKEN TOMB' : 'DESERT'}
                </span>
                <div className="flex items-center gap-1.5">
                  {hud.tomb.hasAnkhKey && (
                    <span className="px-1 bg-[#3a260c] border border-[#ebc049]/70 text-[#ffdf7c] text-[9px]">
                      KEY
                    </span>
                  )}
                  <span className="text-[#e7cf9e] tabular-nums">
                    RELICS {hud.tomb.artifacts}/{hud.tomb.maxArtifacts}
                  </span>
                </div>
              </div>

              {(devOptions.godMode || devOptions.noBarriers || devOptions.speedBoost) && (
                <div className="w-52 bg-[#162928]/88 border border-[#6ec7c0]/60 px-3 py-1 text-[9px] tracking-[0.14em] font-mono text-[#9ff3ea] uppercase flex flex-wrap gap-x-2">
                  <span>DEV:</span>
                  {devOptions.godMode && <span>GOD</span>}
                  {devOptions.noBarriers && <span>NO-BARRIER</span>}
                  {devOptions.speedBoost && <span>2.5X</span>}
                </div>
              )}
            </div>

            {/* Top-Center Desert Compass */}
            <div className="bg-[#1b1106]/82 border border-[#d6a042]/45 px-4 py-1.5 text-center">
              <div className="text-[11px] tracking-[0.22em] text-[#f5ca64] font-semibold tabular-nums">
                {cardinalLabel}
              </div>
              <div className="text-[10px] tracking-[0.16em] text-[#cbb082] tabular-nums">
                {String(hud.headingDeg).padStart(3, '0')}°
              </div>
            </div>

            {/* Top-Right Quick Controls & Developer Mode Drawer */}
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    document.exitPointerLock?.();
                    setDevPanelOpen((v) => !v);
                  }}
                  className="bg-[#162928]/90 hover:bg-[#1e3a3d] border border-[#6ec7c0]/60 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase text-[#9ff3ea] cursor-pointer"
                  title="Toggle Developer Mode Menu (` or F9)"
                >
                  {devPanelOpen ? 'Dev: Open (`)' : 'Dev (`)'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="bg-[#1b1106]/85 hover:bg-[#2d1c0a] border border-[#d6a042]/50 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase text-[#f0c768] cursor-pointer"
                  title="Mute / Unmute Music (M)"
                >
                  {muted ? 'Music: Off (M)' : 'Music: On (M)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (phase === 'playing') {
                      document.exitPointerLock?.();
                      setGamePhase('paused');
                    } else {
                      handleResume();
                    }
                  }}
                  className="bg-[#1b1106]/85 hover:bg-[#2d1c0a] border border-[#d6a042]/50 px-3 py-1.5 text-[11px] tracking-[0.18em] uppercase text-[#f0c768] cursor-pointer"
                >
                  {phase === 'paused' ? 'Resume' : 'Pause'}
                </button>
              </div>

              {devPanelOpen && (
                <div className="w-64 bg-[#14110b]/94 border border-[#6ec7c0]/60 p-3 shadow-2xl font-mono text-[11px] text-[#e7cf9e] flex flex-col gap-2">
                  <div className="flex items-center justify-between border-b border-[#6ec7c0]/30 pb-1.5">
                    <span className="text-[10px] tracking-[0.18em] uppercase text-[#9ff3ea] font-bold">
                      Developer Mode
                    </span>
                    <span className="text-[9px] text-[#9ec4bf]">` / F9</span>
                  </div>

                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span>Invincible / No HP Loss (G)</span>
                    <input
                      type="checkbox"
                      checked={devOptions.godMode}
                      onChange={() => toggleDevOption('godMode')}
                      className="accent-[#6ec7c0] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span>No Barriers + Fly (N)</span>
                    <input
                      type="checkbox"
                      checked={devOptions.noBarriers}
                      onChange={() => toggleDevOption('noBarriers')}
                      className="accent-[#6ec7c0] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span>2.5× Travel Speed (V)</span>
                    <input
                      type="checkbox"
                      checked={devOptions.speedBoost}
                      onChange={() => toggleDevOption('speedBoost')}
                      className="accent-[#6ec7c0] cursor-pointer"
                    />
                  </label>

                  {devOptions.noBarriers && (
                    <div className="text-[9px] text-[#9ff3ea]/85 leading-snug bg-[#1b2e2d] px-2 py-1 border border-[#6ec7c0]/30">
                      Free Fly active: Hold Space to rise, Ctrl/C to descend, walk through any wall or door.
                    </div>
                  )}

                  <div className="border-t border-[#6ec7c0]/25 pt-2 grid grid-cols-2 gap-1.5 text-[9px] uppercase tracking-[0.1em]">
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('toggle-tomb')}
                      className="col-span-2 py-1 bg-[#253a38] hover:bg-[#314e4b] border border-[#6ec7c0]/50 text-[#c9faf4] cursor-pointer"
                    >
                      {hud.realm === 'tomb'
                        ? 'Warp: Exit to Desert (T)'
                        : 'Warp: Enter Sunken Tomb (T)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('desert-plaza')}
                      className="py-1 bg-[#241a0d] hover:bg-[#362714] border border-[#d6a042]/45 text-[#f3cf7a] cursor-pointer"
                    >
                      Desert Plaza
                    </button>
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('tomb-entrance')}
                      className="py-1 bg-[#241a0d] hover:bg-[#362714] border border-[#d6a042]/45 text-[#f3cf7a] cursor-pointer"
                    >
                      Tomb Entrance
                    </button>
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('tomb-sanctuary')}
                      className="py-1 bg-[#241a0d] hover:bg-[#362714] border border-[#d6a042]/45 text-[#f3cf7a] cursor-pointer"
                    >
                      Sanctuary
                    </button>
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('tomb-treasury')}
                      className="py-1 bg-[#241a0d] hover:bg-[#362714] border border-[#d6a042]/45 text-[#f3cf7a] cursor-pointer"
                    >
                      Boss Arena
                    </button>
                    <button
                      type="button"
                      onClick={() => devActionRef.current?.('unlock-tomb')}
                      className="col-span-2 py-1 bg-[#30200b] hover:bg-[#473011] border border-[#ebc049]/55 text-[#ffe394] cursor-pointer"
                    >
                      Unlock All Tomb Doors
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dedicated Final Boss Awakening Banner & Health Bar */}
          {hud.realm === 'tomb' && hud.boss.active && phase === 'playing' && (
            <div className="self-center w-full max-w-md bg-[#120b07]/90 border border-[#d6a042]/70 px-4 py-2 shadow-2xl mb-1">
              <div className="flex items-center justify-between text-[11px] tracking-[0.2em] uppercase font-bold text-[#ffe08a]">
                <span>{hud.boss.name}</span>
                <span className="text-[10px] text-[#73efe0] font-mono">
                  {hud.boss.health} / {hud.boss.maxHealth}
                </span>
              </div>
              <div className="text-[9px] tracking-[0.22em] text-[#e5a649] uppercase mt-0.5 mb-1">
                {hud.boss.subtitle}
              </div>
              <div className="relative h-3 w-full bg-[#090504] border border-[#d6a042]/55 overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.boss.health / hud.boss.maxHealth) * 100))}%`,
                    background:
                      hud.boss.phase === 3
                        ? 'linear-gradient(90deg, #991818, #ef492b, #ffb347)'
                        : hud.boss.phase === 2
                        ? 'linear-gradient(90deg, #0d6d63, #2de0ca, #f0be4d)'
                        : 'linear-gradient(90deg, #8b5a14, #d69c36, #ffdf7c)',
                  }}
                />
                {/* Phase II (66%) & Phase III (33%) notches */}
                <div className="absolute top-0 bottom-0 left-[33%] w-[2px] bg-[#0a0604]/85" />
                <div className="absolute top-0 bottom-0 left-[66%] w-[2px] bg-[#0a0604]/85" />
              </div>
            </div>
          )}

          {/* Center-Lower Interaction Prompt & Carved Stone Inscription Toast */}
          <div className="flex flex-col items-center gap-2.5 mb-2">
            {activeBanner && (
              <div
                className="px-4 py-1 text-[11px] tracking-[0.22em] uppercase font-bold border shadow-lg"
                style={{
                  backgroundColor:
                    activeBanner.tone === 'danger'
                      ? 'rgba(72, 16, 12, 0.9)'
                      : 'rgba(34, 23, 8, 0.9)',
                  borderColor:
                    activeBanner.tone === 'danger' ? '#ef5340' : '#ebc049',
                  color: activeBanner.tone === 'danger' ? '#ffd2c8' : '#ffe394',
                }}
              >
                {activeBanner.text}
              </div>
            )}

            {activeInscription && (
              <div className="max-w-lg bg-[#1a1005]/92 border border-[#e3b14d]/70 px-5 py-3.5 text-center shadow-xl">
                <div className="flex items-center justify-center gap-2 text-[11px] tracking-[0.24em] text-[#f6ca62] uppercase font-bold">
                  <AythamIconSvg className="w-3.5 h-3.5" />
                  <span>{activeInscription.title}</span>
                  <AythamIconSvg className="w-3.5 h-3.5" />
                </div>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#f2e2c2] italic">
                  {activeInscription.text}
                </p>
              </div>
            )}

            {hud.stealth.canTakedown && !activeInscription && phase === 'playing' && (
              <div className="bg-[#2a1109]/92 border border-[#e6694b]/80 px-4 py-1.5 text-[11px] tracking-[0.2em] uppercase text-[#ffd7be] font-semibold">
                [E] Silent Takedown
              </div>
            )}

            {!hud.stealth.canTakedown && hud.nearLandmark && !activeInscription && phase === 'playing' && (
              <div className="bg-[#1b1106]/88 border border-[#e6b34b]/65 px-4 py-1.5 text-[11px] tracking-[0.2em] uppercase text-[#fae09e]">
                [E] {hud.nearLandmark.label}
              </div>
            )}
          </div>

          {/* Collapsible Bottom Control & Audio Dock (Zero Side-Panel Clutter) */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setDockOpen((v) => !v)}
              className="pointer-events-auto bg-[#1b1106]/88 hover:bg-[#2b1a09] border border-b-0 border-[#d6a042]/45 px-3 py-0.5 text-[10px] tracking-[0.2em] uppercase text-[#e6c37b] cursor-pointer"
            >
              {dockOpen ? '▾ Hide Controls (H)' : '▴ Show Controls (H)'}
            </button>

            {dockOpen && (
              <div className="pointer-events-auto w-full max-w-[920px] bg-[#170e05]/88 border border-[#d6a042]/45 px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px]">
                {/* Audio Volume Control */}
                <div className="flex items-center gap-2.5">
                  <span className="uppercase tracking-[0.16em] text-[#e8be63] text-[10px] font-semibold">
                    BGM
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : Math.round(volume * 100)}
                    onChange={(e) =>
                      handleVolumeChange(Number(e.target.value) / 100)
                    }
                    className="akk-slider w-20 sm:w-24"
                    aria-label="Background Music Volume"
                  />
                  <span className="text-[10px] text-[#d9bc86] w-8 tabular-nums">
                    {muted ? '0%' : `${Math.round(volume * 100)}%`}
                  </span>
                </div>

                {/* Compact Controls Reference */}
                <div className="text-[10px] tracking-[0.12em] uppercase text-[#e2cba0]">
                  <span className="text-[#f4c65d]">WASD</span> Move ·{' '}
                  <span className="text-[#f4c65d]">Shift</span> Sprint ·{' '}
                  <span className="text-[#f4c65d]">Space</span> Jump ·{' '}
                  <span className="text-[#f4c65d]">Ctrl/C</span> Sneak ·{' '}
                  <span className="text-[#f4c65d]">LMB</span> Vel ·{' '}
                  <span className="text-[#f4c65d]">RMB</span> Shield ·{' '}
                  <span className="text-[#f4c65d]">Q</span> Dodge ·{' '}
                  <span className="text-[#f4c65d]">E</span> Inspect
                </div>

                {/* Mouse Look Status Hint */}
                <div className="text-[10px] tracking-[0.14em] uppercase text-[#c7a974]">
                  {hud.pointerLocked
                    ? 'Mouse Locked (Esc)'
                    : 'Click World to Look'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * PAUSE MODAL
       * ===================================================================*/}
      {phase === 'paused' && (
        <div className="absolute inset-0 bg-[#120a03]/72 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#1c1106] border-2 border-[#d8a140]/70 p-6 shadow-2xl flex flex-col items-center text-center">
            <AythamIconSvg className="w-7 h-7 mb-2" />
            <h2 className="text-xl font-bold tracking-[0.28em] text-[#f4c65d] uppercase">
              Paused
            </h2>
            <p className="text-[11px] tracking-[0.18em] text-[#cbb082] uppercase mt-1">
              AKK · Sunlit Desert Ruins
            </p>

            <div className="w-full mt-5 pt-4 border-t border-[#d8a140]/30 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-xs tracking-[0.14em] uppercase">
                <span className="text-[#e7c98e]">Music Volume</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : Math.round(volume * 100)}
                    onChange={(e) =>
                      handleVolumeChange(Number(e.target.value) / 100)
                    }
                    className="akk-slider w-28"
                  />
                  <span className="w-8 text-right tabular-nums text-[#f3ca66]">
                    {muted ? '0%' : `${Math.round(volume * 100)}%`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleMute}
                className="w-full py-2 bg-[#2b1b0a] hover:bg-[#3a250e] border border-[#d6a042]/50 text-xs tracking-[0.2em] uppercase text-[#f0c768] cursor-pointer"
              >
                {muted ? 'Unmute Music (M)' : 'Mute Music (M)'}
              </button>

              <button
                type="button"
                onClick={handleResume}
                className="w-full py-2.5 mt-1 bg-[#c98828] hover:bg-[#e3a33a] text-[#1a0f04] font-bold text-xs tracking-[0.24em] uppercase border border-[#ffe294] cursor-pointer"
              >
                Resume Expedition
              </button>

              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full py-2 bg-transparent hover:bg-[#2a1a0a] border border-[#d6a042]/35 text-[11px] tracking-[0.2em] uppercase text-[#d8bc8a] cursor-pointer"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
       * GAME OVER MODAL
       * ===================================================================*/}
      {phase === 'gameover' && (
        <div className="absolute inset-0 bg-[#140704]/82 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#1c1006] border-2 border-[#c94a38]/75 p-7 shadow-2xl flex flex-col items-center text-center">
            <AythamIconSvg className="w-7 h-7 mb-2" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[0.2em] text-[#e4523b] uppercase">
              You have fallen
            </h2>
            <p className="text-[11px] tracking-[0.18em] text-[#d6b989] uppercase mt-2">
              The sands reclaim the seeker
            </p>

            <button
              type="button"
              onClick={handleRetryGame}
              className="w-full py-2.5 mt-6 bg-[#c98828] hover:bg-[#e3a33a] text-[#1a0f04] font-bold text-xs tracking-[0.24em] uppercase border border-[#ffe294] cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
       * PHASE 4 VICTORY ENDING MODAL (CROWN OF KORKAI & RA RECLAIMED)
       * ===================================================================*/}
      {phase === 'victory' && (
        <div className="absolute inset-0 bg-gradient-to-t from-[#120b04]/90 via-[#120b04]/35 to-transparent flex items-end sm:items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#1a1005]/92 border-2 border-[#f3c55c]/80 p-7 shadow-2xl flex flex-col items-center text-center">
            <AythamIconSvg className="w-8 h-8 mb-2" />
            <div className="text-[10px] tracking-[0.28em] text-[#73efe0] uppercase font-semibold">
              End of Phase 4 Demo
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-[0.2em] text-[#f7cc64] uppercase mt-1">
              Crown of Korkai & Ra Reclaimed
            </h2>
            <p className="text-xs leading-relaxed text-[#f0dec0] mt-3">
              With Anpu-Kar defeated and the Golden Sanctum unsealed, the ancient Tamil explorer recovers the sacred Crown linking Tamilakam to the Nile.
            </p>

            <div className="w-full mt-4 pt-3 border-t border-[#d6a042]/35 flex justify-around text-[11px] font-mono text-[#e8cf9d]">
              <div>
                <div className="text-[#f4c65d] font-bold">
                  {hud.tomb.artifacts}/{hud.tomb.maxArtifacts}
                </div>
                <div className="text-[9px] uppercase tracking-[0.15em]">Relics</div>
              </div>
              <div>
                <div className="text-[#73efe0] font-bold">VANQUISHED</div>
                <div className="text-[9px] uppercase tracking-[0.15em]">Anpu-Kar</div>
              </div>
            </div>

            <div className="w-full mt-5 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleResume}
                className="flex-1 py-2.5 bg-[#2a1b09] hover:bg-[#3a260e] border border-[#d6a042]/65 text-[11px] tracking-[0.18em] uppercase text-[#f5d27a] cursor-pointer"
              >
                Continue Exploring
              </button>
              <button
                type="button"
                onClick={handleRetryGame}
                className="flex-1 py-2.5 bg-[#c98828] hover:bg-[#e3a33a] text-[#1a0f04] font-bold text-[11px] tracking-[0.2em] uppercase border border-[#ffe294] cursor-pointer"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
