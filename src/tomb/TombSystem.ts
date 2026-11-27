import * as THREE from 'three';
import { applyTombPs2Wobble } from './ps2Utils';
import { createTombTextures, TombGlyphKind, TombTextureLibrary } from './tombTextures';
import { BossAudioHooks, BossGuardian, BossHudSnapshot } from './BossGuardian';

export type { BossHudSnapshot };

export type TombCollider =
  | {
      type: 'cylinder';
      x: number;
      z: number;
      radius: number;
      minY: number;
      maxY: number;
    }
  | {
      type: 'box';
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      minY: number;
      maxY: number;
    };

export type TombBoxCollider = Extract<TombCollider, { type: 'box' }>;

export interface TombShadowZone {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export interface TombHudState {
  artifacts: number;
  maxArtifacts: number;
  hasAnkhKey: boolean;
  puzzleASolved: boolean;
  puzzleBSolved: boolean;
  secretOpened: boolean;
}

export interface TombInteractPrompt {
  id: string;
  label: string;
  title: string;
}

export interface TombAudioHooks extends BossAudioHooks {
  playStoneResonance: () => void;
  playPressurePlateClick: () => void;
  playDartTrapFire: () => void;
  playSpikeWarning: () => void;
  playSpikeSnap: () => void;
  playStoneGrind: () => void;
  playPuzzleChime: (step: number, complete: boolean) => void;
  playTreasureOpen: () => void;
  playTombTransition: () => void;
}

export interface TombInteractionOutcome {
  kind: 'message' | 'exit-tomb' | 'victory' | 'none';
  title?: string;
  text?: string;
  banner?: string;
  healHealth?: number;
  healStamina?: number;
}

interface TombInteractiveNode {
  id: string;
  label: string | (() => string);
  title: string;
  position: THREE.Vector3;
  radius: number;
  enabled: () => boolean;
  onInteract: (audio: TombAudioHooks) => TombInteractionOutcome;
}

interface DartProjectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

interface PressureDartTrap {
  id: string;
  plateX: number;
  plateZ: number;
  plateMesh: THREE.Mesh;
  nozzleLightMesh: THREE.Mesh;
  wallX: number;
  dirX: number;
  zOffsets: number[];
  depressed: number;
  cooldown: number;
  wasStepped: boolean;
}

interface SpikeTrap {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spikesGroup: THREE.Group;
  warningMat: THREE.MeshStandardMaterial;
  cycleTime: number;
  phase: 'idle' | 'warning' | 'active';
  hitCooldown: number;
}

interface MovingCrusher {
  mesh: THREE.Mesh;
  collider: TombBoxCollider;
  zCenter: number;
  minX: number;
  maxX: number;
  halfW: number;
  halfD: number;
  phaseOffset: number;
  speed: number;
  lastDir: number;
  hitCooldown: number;
}

interface RotatingDisc {
  id: string;
  name: string;
  drumGroup: THREE.Group;
  ringMat: THREE.MeshStandardMaterial;
  currentIndex: number;
  visualYaw: number;
  targetIndex: number;
}

const GLYPH_ORDER: TombGlyphKind[] = ['sun', 'scarab', 'serpent', 'aytham'];
const GLYPH_LABELS: Record<TombGlyphKind, string> = {
  sun: 'SUN',
  scarab: 'SCARAB',
  serpent: 'SERPENT',
  aytham: 'AYTHAM (ஃ)',
};

type SymbolA = 'sun' | 'lotus' | 'aytham';
const PUZZLE_A_ORDER: SymbolA[] = ['sun', 'lotus', 'aytham'];

/**
 * Computes floor elevation inside the underground tomb.
 */
export function tombGroundHeightAt(x: number, z: number): number {
  // Entrance steps descending from the desert seal
  if (Math.abs(x) <= 5.2 && z >= 2.8 && z <= 6.2) {
    return THREE.MathUtils.clamp(((z - 2.8) / 3.0) * 1.45, 0, 1.45);
  }
  // Raised Pharaoh Sanctuary Dais in Room 3
  if (Math.abs(x) <= 11.2 && z <= -78.5 && z >= -84.2) {
    return 0.35;
  }
  return 0;
}

export class TombSystem {
  public readonly group = new THREE.Group();
  public readonly colliders: TombCollider[] = [];
  public readonly cameraOccluders: THREE.Object3D[] = [];
  public readonly losOccluders: THREE.Object3D[] = [];
  public readonly shadowZones: TombShadowZone[] = [];

  private textures: TombTextureLibrary;
  private pointLights: Array<{
    light: THREE.PointLight;
    baseIntensity: number;
    seed: number;
    flameMesh: THREE.Mesh;
  }> = [];
  private dustPoints: THREE.Points;
  private dustAttr: THREE.BufferAttribute;

  private interactives: TombInteractiveNode[] = [];
  private pressureTraps: PressureDartTrap[] = [];
  private darts: DartProjectile[] = [];
  private spikeTraps: SpikeTrap[] = [];
  private crushers: MovingCrusher[] = [];

  // Puzzle A state
  private puzzleAStep = 0;
  private puzzleASolved = false;
  private gateADoor!: THREE.Mesh;
  private gateACollider!: TombBoxCollider;
  private gateAOpenAmount = 0;
  private gateASockets: THREE.MeshStandardMaterial[] = [];
  private pedestalCrystalMats: Record<SymbolA, THREE.MeshStandardMaterial> = {} as Record<
    SymbolA,
    THREE.MeshStandardMaterial
  >;

  // Secret Wall state
  private secretOpened = false;
  private secretOpenAmount = 0;
  private secretWallMesh!: THREE.Mesh;
  private secretWallCollider!: TombBoxCollider;
  private keystoneMesh!: THREE.Mesh;

  // Puzzle B state
  private discs: RotatingDisc[] = [];
  private puzzleBSolved = false;
  private vaultDoor!: THREE.Mesh;
  private vaultDoorCollider!: TombBoxCollider;
  private vaultDoorOpenAmount = 0;

  // Treasures & Keys
  private hasAnkhKey = false;
  private keyPickupMesh!: THREE.Group;
  private pearlChestOpened = false;
  private pearlChestLid!: THREE.Group;
  private secretChestOpened = false;
  private secretChestLid!: THREE.Group;
  private treasuryChestOpened = false;
  private treasuryChestLid!: THREE.Group;
  private crownClaimed = false;
  private crownGroup!: THREE.Group;
  private artifactsCollected = 0;

  // Final Boss Arena & Guardian
  public readonly boss!: BossGuardian;
  private bossArenaGroup = new THREE.Group();
  private bossEntranceBarrier!: THREE.Mesh;
  private bossEntranceCollider!: TombBoxCollider;
  private bossTreasureBarrier!: THREE.Mesh;
  private bossTreasureCollider!: TombBoxCollider;
  private bossWallGlyphMats: THREE.MeshStandardMaterial[] = [];
  private bossArenaTorches: Array<{ light: THREE.PointLight; baseIntensity: number }> = [];

  private isSoftwareGl: boolean;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    this.isSoftwareGl = isSoftwareGl;
    this.textures = createTombTextures();
    this.group.visible = false;

    const { dustPoints, dustAttr } = this.buildArchitectureAndMechanisms();
    this.dustPoints = dustPoints;
    this.dustAttr = dustAttr;

    scene.add(this.group);
  }

  private buildArchitectureAndMechanisms(): {
    dustPoints: THREE.Points;
    dustAttr: THREE.BufferAttribute;
  } {
    const stoneMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.hieroglyphWall,
        color: 0xd9b07c,
        roughness: 0.9,
        metalness: 0.04,
        flatShading: true,
      })
    );
    const darkStoneMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.tombFloor,
        color: 0xa47d4e,
        roughness: 0.94,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const floorMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.tombFloor,
        color: 0xc29763,
        roughness: 0.92,
        metalness: 0.03,
        flatShading: true,
      })
    );
    const crackedMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        map: this.textures.crackedWall,
        color: 0xd7b07c,
        roughness: 0.88,
        metalness: 0.04,
        flatShading: true,
      })
    );
    const goldMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0xe6b446,
        roughness: 0.28,
        metalness: 0.85,
        flatShading: true,
      })
    );
    const bronzeMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0x8f622c,
        roughness: 0.45,
        metalness: 0.65,
        flatShading: true,
      })
    );

    // Tomb Ambient & Hemisphere Fill (dark, moody atmosphere)
    const tombAmbient = new THREE.AmbientLight(0x47301d, 0.72);
    const tombHemi = new THREE.HemisphereLight(0x5c422a, 0x120a05, 0.45);
    this.group.add(tombAmbient, tombHemi);

    // Helpers for airtight walls, floors & ceilings
    const addBox = (
      x1: number,
      x2: number,
      y1: number,
      y2: number,
      z1: number,
      z2: number,
      mat: THREE.Material,
      solidCollider = true,
      occludesCamera = true
    ): THREE.Mesh => {
      const w = x2 - x1;
      const h = y2 - y1;
      const d = z2 - z1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
      mesh.receiveShadow = true;
      mesh.castShadow = !this.isSoftwareGl && h > 1.5;
      this.group.add(mesh);
      if (solidCollider) {
        this.colliders.push({
          type: 'box',
          minX: x1,
          maxX: x2,
          minZ: z1,
          maxZ: z2,
          minY: y1 - 0.5,
          maxY: y2 + 0.5,
        });
      }
      if (occludesCamera) {
        this.cameraOccluders.push(mesh);
        this.losOccluders.push(mesh);
      }
      return mesh;
    };

    const addRoomShell = (
      x1: number,
      x2: number,
      z1: number,
      z2: number,
      ceilH: number
    ) => {
      // Floor slab & ceiling slab
      addBox(x1 - 0.6, x2 + 0.6, -0.5, 0, z1 - 0.6, z2 + 0.6, floorMat, false, true);
      addBox(x1 - 0.6, x2 + 0.6, ceilH, ceilH + 0.8, z1 - 0.6, z2 + 0.6, darkStoneMat, false, true);
    };

    const addTorch = (x: number, y: number, z: number, addLight = true, lightRange = 14) => {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), bronzeMat);
      bracket.position.set(x, y - 0.18, z);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.2, 6), bronzeMat);
      bowl.position.set(x, y + 0.16, z);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa3b });
      const flameMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), flameMat);
      flameMesh.position.set(x, y + 0.38, z);
      this.group.add(bracket, bowl, flameMesh);

      if (addLight) {
        const light = new THREE.PointLight(0xff9b3d, 6.2, lightRange, 1.5);
        light.position.set(x, y + 0.45, z);
        this.group.add(light);
        this.pointLights.push({
          light,
          baseIntensity: 6.2,
          seed: x * 1.7 + z * 0.9,
          flameMesh,
        });
      }
    };

    const addBrazier = (x: number, y: number, z: number, withLight = true) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 0.9, 6), bronzeMat);
      stand.position.set(x, y + 0.45, z);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.24, 0.28, 7), bronzeMat);
      basin.position.set(x, y + 0.98, z);
      const ember = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: 0xffa634 })
      );
      ember.position.set(x, y + 1.18, z);
      this.group.add(stand, basin, ember);
      this.colliders.push({
        type: 'cylinder',
        x,
        z,
        radius: 0.48,
        minY: y - 0.5,
        maxY: y + 2,
      });

      if (withLight) {
        const light = new THREE.PointLight(0xffa042, 7.5, 16, 1.45);
        light.position.set(x, y + 1.45, z);
        this.group.add(light);
        this.pointLights.push({
          light,
          baseIntensity: 7.5,
          seed: x * 2.1 + z * 1.3,
          flameMesh: ember,
        });
      }
    };

    const buildChest = (x: number, y: number, z: number, rotY: number, isGold: boolean) => {
      const chest = new THREE.Group();
      chest.position.set(x, y, z);
      chest.rotation.y = rotY;
      const bodyMat = isGold ? goldMat : bronzeMat;
      const trimMat = isGold ? bronzeMat : goldMat;

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.52, 0.72), bodyMat);
      base.position.y = 0.26;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.76), trimMat);
      band.position.y = 0.48;
      chest.add(base, band);

      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.52, -0.34);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.24, 0.74), trimMat);
      lid.position.set(0, 0.12, 0.34);
      lidPivot.add(lid);
      chest.add(lidPivot);
      this.group.add(chest);

      this.colliders.push({
        type: 'box',
        minX: x - 0.65,
        maxX: x + 0.65,
        minZ: z - 0.5,
        maxZ: z + 0.5,
        minY: y - 0.2,
        maxY: y + 1.4,
      });
      return lidPivot;
    };

    const addSarcophagus = (x: number, y: number, z: number, rotY = 0) => {
      const sg = new THREE.Group();
      sg.position.set(x, y, z);
      sg.rotation.y = rotY;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 2.7), darkStoneMat);
      base.position.y = 0.425;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.26, 2.52), stoneMat);
      lid.position.y = 0.96;
      const mask = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.65), goldMat);
      mask.position.set(0, 1.14, -0.68);
      sg.add(base, lid, mask);
      this.group.add(sg);
      this.cameraOccluders.push(base, lid);
      this.losOccluders.push(base, lid);
      this.colliders.push({
        type: 'box',
        minX: x - (Math.abs(Math.sin(rotY)) > 0.5 ? 1.45 : 0.85),
        maxX: x + (Math.abs(Math.sin(rotY)) > 0.5 ? 1.45 : 0.85),
        minZ: z - (Math.abs(Math.sin(rotY)) > 0.5 ? 0.85 : 1.45),
        maxZ: z + (Math.abs(Math.sin(rotY)) > 0.5 ? 0.85 : 1.45),
        minY: y - 0.2,
        maxY: y + 1.6,
      });
    };

    // ========================================================================
    // ROOM 1: ENTRANCE VESTIBULE (X: [-5, 5], Z: [-4, 6])
    // ========================================================================
    addRoomShell(-5, 5, -4, 6, 5.4);
    addBox(-6.4, -5.0, 0, 5.4, -4.6, 6.4, stoneMat); // West
    addBox(5.0, 6.4, 0, 5.4, -4.6, 6.4, stoneMat); // East
    addBox(-5.6, 5.6, 0, 5.4, 6.0, 7.2, stoneMat); // South back wall
    addBox(-5.6, -3.2, 0, 5.4, -4.8, -4.0, stoneMat); // North-west nib
    addBox(3.2, 5.6, 0, 5.4, -4.8, -4.0, stoneMat); // North-east nib
    addBox(-3.4, 3.4, 4.3, 5.4, -4.8, -4.0, darkStoneMat); // Arch lintel

    // Ascending entrance steps & Exit Portal
    for (let s = 0; s < 5; s++) {
      const sz1 = 2.8 + s * 0.64;
      const sz2 = sz1 + 0.66;
      const sy = ((s + 1) / 5) * 1.45;
      addBox(-2.6, 2.6, 0, sy, sz1, sz2, darkStoneMat, false, false);
    }
    const exitDoor = addBox(-1.6, 1.6, 1.45, 4.2, 5.4, 5.95, goldMat, true, false);
    const exitAytham = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ map: this.textures.glyphs.aytham, transparent: false })
    );
    exitAytham.position.set(0, 2.9, 5.38);
    exitAytham.rotation.y = Math.PI;
    this.group.add(exitAytham);
    void exitDoor;

    addTorch(-4.65, 2.7, -0.5, true, 14);
    addTorch(4.65, 2.7, -0.5, true, 14);

    // Storytelling Vignette: Fallen earlier explorer's pack & bronze lantern
    const skelGroup = new THREE.Group();
    skelGroup.position.set(-3.4, 0, 0.9);
    const skull = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: 0xddd1b0, roughness: 0.85, flatShading: true })
    );
    skull.position.set(0.2, 0.16, 0.25);
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 0.34), bronzeMat);
    satchel.position.set(-0.22, 0.12, -0.1);
    satchel.rotation.y = 0.5;
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.46), stoneMat);
    tablet.position.set(0.15, 0.04, -0.24);
    tablet.rotation.y = -0.35;
    skelGroup.add(skull, satchel, tablet);
    this.group.add(skelGroup);

    this.interactives.push(
      {
        id: 'tomb-exit-portal',
        label: 'ASCEND TO DESERT RUINS',
        title: 'SUNKEN TOMB EXIT',
        position: new THREE.Vector3(0, 1.45, 5.2),
        radius: 3.1,
        enabled: () => true,
        onInteract: (audio) => {
          audio.playTombTransition();
          return { kind: 'exit-tomb' };
        },
      },
      {
        id: 'expedition-journal',
        label: 'READ EXPEDITION TABLET',
        title: 'FALLEN NAVIGATOR’S LOG',
        position: new THREE.Vector3(-3.4, 0.3, 0.9),
        radius: 2.8,
        enabled: () => true,
        onInteract: (audio) => {
          audio.playStoneResonance();
          return {
            kind: 'message',
            title: 'FALLEN NAVIGATOR’S LOG',
            text:
              '"The Hall of Needles hides weighted floor triggers that loose bronze darts, and timed floor grates beyond. Hug the margins or raise your Kedayam shield. Past the pillar hall lies a loose keystone on the western wall."',
          };
        },
      }
    );

    // ========================================================================
    // CORRIDOR 1: HALL OF NEEDLES (X: [-3.2, 3.2], Z: [-24, -4]) + EAST ALCOVE
    // ========================================================================
    addRoomShell(-3.2, 3.2, -24, -4, 4.8);
    addBox(-4.6, -3.2, 0, 4.8, -24.2, -3.8, stoneMat); // West corridor wall
    addBox(3.2, 4.6, 0, 4.8, -11.5, -3.8, stoneMat); // East south segment
    addBox(3.2, 4.6, 0, 4.8, -24.2, -15.5, stoneMat); // East north segment

    // East Key Alcove (X: [3.2, 6.4], Z: [-15.5, -11.5])
    addRoomShell(3.2, 6.4, -15.5, -11.5, 4.4);
    addBox(6.4, 7.6, 0, 4.4, -16.0, -11.0, stoneMat); // Alcove east back
    addBox(3.2, 6.6, 0, 4.4, -11.5, -10.5, stoneMat); // Alcove south wall
    addBox(3.2, 6.6, 0, 4.4, -16.5, -15.5, stoneMat); // Alcove north wall

    // Key pickup inside East Alcove
    const keyPlinth = addBox(4.4, 5.6, 0, 0.72, -14.1, -12.9, darkStoneMat, true, false);
    void keyPlinth;
    this.keyPickupMesh = new THREE.Group();
    this.keyPickupMesh.position.set(5.0, 1.1, -13.5);
    const keyRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.045, 6, 12), goldMat);
    keyRing.position.y = 0.18;
    const keyShaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.05), goldMat);
    const keyCross = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), goldMat);
    keyCross.position.y = 0.04;
    this.keyPickupMesh.add(keyRing, keyShaft, keyCross);
    this.group.add(this.keyPickupMesh);

    this.interactives.push({
      id: 'ankh-key-pickup',
      label: 'TAKE ANKH BRONZE KEY',
      title: 'ANKH BRONZE KEY',
      position: new THREE.Vector3(5.0, 0.8, -13.5),
      radius: 2.6,
      enabled: () => !this.hasAnkhKey,
      onInteract: (audio) => {
        this.hasAnkhKey = true;
        this.keyPickupMesh.visible = false;
        audio.playPuzzleChime(2, false);
        return {
          kind: 'message',
          title: 'ANKH BRONZE KEY ACQUIRED',
          text: 'An ancient forged Ankh key. It likely unlocks a sealed bronze chest in the Pillar Chamber ahead.',
          banner: 'KEY ACQUIRED: ANKH BRONZE KEY',
        };
      },
    });

    addTorch(-2.9, 2.5, -11.0, true, 13);
    addTorch(2.9, 2.5, -18.5, true, 13);

    // Helper to build Pressure Plate + Dart Trap
    const buildDartTrap = (
      id: string,
      plateZ: number,
      wallX: number,
      dirX: number,
      zOffsets: number[]
    ) => {
      const plateFrame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 2.0), bronzeMat);
      plateFrame.position.set(0, 0.04, plateZ);
      const plateMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.14, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xb94a2c, roughness: 0.75, flatShading: true })
      );
      plateMesh.position.set(0, 0.09, plateZ);
      this.group.add(plateFrame, plateMesh);

      const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0xd99b42,
        emissive: 0x3b1204,
        emissiveIntensity: 0.3,
        flatShading: true,
      });
      const nozzleLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 1.3), nozzleMat);
      nozzleLightMesh.position.set(wallX, 1.2, plateZ);
      this.group.add(nozzleLightMesh);

      zOffsets.forEach((zo) => {
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.18, 6),
          new THREE.MeshBasicMaterial({ color: 0x160b05 })
        );
        hole.rotation.z = Math.PI / 2;
        hole.position.set(wallX - dirX * 0.08, 1.15, plateZ + zo);
        this.group.add(hole);
      });

      this.pressureTraps.push({
        id,
        plateX: 0,
        plateZ,
        plateMesh,
        nozzleLightMesh,
        wallX,
        dirX,
        zOffsets,
        depressed: 0,
        cooldown: 0,
        wasStepped: false,
      });
    };

    buildDartTrap('dart-1', -9.0, -3.05, 1, [-0.4, 0.4]);
    buildDartTrap('dart-2', -19.5, 3.05, -1, [-0.45, 0.45]);

    // Dart Projectile Pool
    const dartGeo = new THREE.ConeGeometry(0.08, 0.65, 5);
    dartGeo.rotateZ(-Math.PI / 2);
    const dartMat = new THREE.MeshBasicMaterial({ color: 0xffc654 });
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(dartGeo, dartMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.darts.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }

    // Retractable Floor Spikes at Z = -14.5
    const buildSpikeTrap = (id: string, cx: number, cz: number, w: number, d: number) => {
      const warningMat = new THREE.MeshStandardMaterial({
        color: 0x452d1a,
        emissive: 0x000000,
        roughness: 0.85,
        flatShading: true,
      });
      const grate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), warningMat);
      grate.position.set(cx, 0.04, cz);
      this.group.add(grate);

      const spikesGroup = new THREE.Group();
      spikesGroup.position.set(cx, -1.05, cz);
      const spikeGeo = new THREE.ConeGeometry(0.11, 1.12, 4);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xbcb6a4,
        metalness: 0.72,
        roughness: 0.35,
        flatShading: true,
      });
      const cols = 4;
      const rows = 3;
      for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz < rows; iz++) {
          const sp = new THREE.Mesh(spikeGeo, spikeMat);
          sp.position.set(
            ((ix + 0.5) / cols - 0.5) * (w * 0.84),
            0.55,
            ((iz + 0.5) / rows - 0.5) * (d * 0.82)
          );
          spikesGroup.add(sp);
        }
      }
      this.group.add(spikesGroup);
      this.spikeTraps.push({
        id,
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
        spikesGroup,
        warningMat,
        cycleTime: 0,
        phase: 'idle',
        hitCooldown: 0,
      });
    };

    buildSpikeTrap('corridor-spikes', 0, -14.5, 4.1, 2.2);

    // ========================================================================
    // ROOM 2: GRAND PILLAR CHAMBER (X: [-12, 12], Z: [-46, -24]) — PUZZLE A
    // ========================================================================
    addRoomShell(-12, 12, -46, -24, 6.2);
    addBox(-12.6, -3.2, 0, 6.2, -24.6, -23.8, stoneMat); // South-west wall
    addBox(3.2, 12.6, 0, 6.2, -24.6, -23.8, stoneMat); // South-east wall
    addBox(12.0, 13.4, 0, 6.2, -46.6, -23.8, stoneMat); // East wall
    addBox(-13.4, -12.0, 0, 6.2, -32.8, -23.8, stoneMat); // West-south wall
    addBox(-13.4, -12.0, 0, 6.2, -46.6, -37.2, stoneMat); // West-north wall
    addBox(-13.4, -12.0, 4.0, 6.2, -37.6, -32.4, stoneMat); // Secret doorway lintel
    addBox(-12.6, -3.2, 0, 6.2, -46.8, -46.0, stoneMat); // North-west wall
    addBox(3.2, 12.6, 0, 6.2, -46.8, -46.0, stoneMat); // North-east wall
    addBox(-3.5, 3.5, 4.3, 6.2, -46.8, -46.0, darkStoneMat); // North Gate A lintel

    // 4 Grand Columns inside Room 2 (creating shadow cover)
    const pillarSpots: [number, number][] = [
      [-6.5, -31.0],
      [6.5, -31.0],
      [-6.5, -40.0],
      [6.5, -40.0],
    ];
    pillarSpots.forEach(([px, pz]) => {
      const colMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.82, 0.92, 6.2, 8),
        stoneMat
      );
      colMesh.position.set(px, 3.1, pz);
      colMesh.castShadow = !this.isSoftwareGl;
      colMesh.receiveShadow = true;
      this.group.add(colMesh);
      this.cameraOccluders.push(colMesh);
      this.losOccluders.push(colMesh);
      this.colliders.push({
        type: 'cylinder',
        x: px,
        z: pz,
        radius: 0.96,
        minY: -0.5,
        maxY: 6.4,
      });
    });

    addBrazier(-4.6, 0, -25.8, true);
    addBrazier(4.6, 0, -25.8, true);
    addTorch(11.6, 3.0, -35.0, true, 16);
    addTorch(-3.8, 3.0, -45.5, true, 14);

    // Tomb Shadow Zones for stealth in Room 2 & Room 3
    this.shadowZones.push(
      { id: 'tomb-west-pillar', name: 'Pillar Shadow', x: -9.5, z: -31.0, radius: 3.1 },
      { id: 'tomb-east-pillar', name: 'Sanctum Niche Shadow', x: 9.4, z: -40.0, radius: 3.0 },
      { id: 'tomb-north-west', name: 'Crypt Corner Shadow', x: -9.5, z: -41.5, radius: 3.1 },
      { id: 'sanctuary-sw', name: 'Sanctuary West Shadow', x: -8.6, z: -66.5, radius: 3.0 },
      { id: 'sanctuary-nw', name: 'Guardian Shadow', x: -8.6, z: -76.5, radius: 3.1 }
    );
    const tombShadowMat = new THREE.MeshBasicMaterial({
      color: 0x090504,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.shadowZones.forEach((sz) => {
      const geo = new THREE.CircleGeometry(sz.radius, 10);
      geo.rotateX(-Math.PI / 2);
      const disc = new THREE.Mesh(geo, tombShadowMat);
      disc.position.set(sz.x, 0.035, sz.z);
      disc.renderOrder = 1;
      this.group.add(disc);
    });

    // Mural Clue Tablet for Puzzle A
    addBox(-4.2, -3.4, 0, 1.9, -26.0, -25.2, darkStoneMat, true, false);
    const muralFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: this.textures.glyphs.sun })
    );
    muralFace.position.set(-3.8, 1.35, -25.18);
    this.group.add(muralFace);

    this.interactives.push({
      id: 'puzzle-a-mural',
      label: 'READ SANCTUARY MURAL',
      title: 'DECREE OF THE SEALED GATE',
      position: new THREE.Vector3(-3.8, 1.0, -25.6),
      radius: 2.8,
      enabled: () => true,
      onInteract: (audio) => {
        audio.playStoneResonance();
        return {
          kind: 'message',
          title: 'DECREE OF THE SEALED GATE',
          text:
            '"Three wards lock the northern way. Awaken them in order: FIRST, the Golden SUN (I); SECOND, the Nile LOTUS (II); THIRD, the sacred AYTHAM ஃ (III)."',
        };
      },
    });

    // Sealed Stone Gate A (X: [-3.2, 3.2], Z: -46.4)
    this.gateADoor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.3, 0.75), stoneMat);
    this.gateADoor.position.set(0, 2.15, -46.4);
    this.group.add(this.gateADoor);
    this.cameraOccluders.push(this.gateADoor);
    this.losOccluders.push(this.gateADoor);
    this.gateACollider = {
      type: 'box',
      minX: -3.2,
      maxX: 3.2,
      minZ: -46.85,
      maxZ: -45.95,
      minY: -0.5,
      maxY: 4.5,
    };
    this.colliders.push(this.gateACollider);

    // 3 Gate Lock Sockets above Gate A
    for (let s = 0; s < 3; s++) {
      const sockMat = new THREE.MeshStandardMaterial({
        color: 0x3b2c1c,
        emissive: 0x000000,
        flatShading: true,
      });
      const sock = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), sockMat);
      sock.position.set(-1.3 + s * 1.3, 4.75, -45.92);
      this.group.add(sock);
      this.gateASockets.push(sockMat);
    }

    // Puzzle A Pedestals (Sun I, Lotus II, Aytham III)
    const buildSymbolPedestal = (
      sym: SymbolA,
      label: string,
      roman: string,
      px: number,
      pz: number
    ) => {
      addBox(px - 0.55, px + 0.55, 0, 1.1, pz - 0.55, pz + 0.55, darkStoneMat, true, false);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x9b7e48,
        emissive: 0x2a1a05,
        emissiveIntensity: 0.4,
        roughness: 0.35,
        flatShading: true,
      });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
      crystal.position.set(px, 1.55, pz);
      this.group.add(crystal);
      this.pedestalCrystalMats[sym] = crystalMat;

      // Distinct visual topper per symbol
      const emblemGeo =
        sym === 'sun'
          ? new THREE.CylinderGeometry(0.28, 0.28, 0.08, 8)
          : sym === 'lotus'
          ? new THREE.ConeGeometry(0.26, 0.36, 5)
          : new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const topper = new THREE.Mesh(emblemGeo, goldMat);
      topper.position.set(px, 2.05, pz);
      this.group.add(topper);

      this.interactives.push({
        id: `pedestal-${sym}`,
        label: `ACTIVATE ${label} WARD (${roman})`,
        title: `${label} PEDESTAL`,
        position: new THREE.Vector3(px, 1.0, pz),
        radius: 2.7,
        enabled: () => !this.puzzleASolved,
        onInteract: (audio) => this.activatePuzzleAPedestal(sym, label, audio),
      });
    };

    buildSymbolPedestal('sun', 'SUN DISC', 'I', -8.8, -28.0);
    buildSymbolPedestal('lotus', 'NILE LOTUS', 'II', 8.8, -35.0);
    buildSymbolPedestal('aytham', 'AYTHAM (ஃ)', 'III', -8.8, -42.5);

    // Locked Bronze Chest in Room 2 NE corner
    this.pearlChestLid = buildChest(10.2, 0, -43.5, -Math.PI * 0.75, false);
    this.interactives.push({
      id: 'room2-locked-chest',
      label: () =>
        this.hasAnkhKey
          ? 'UNLOCK BRONZE CHEST (ANKH KEY)'
          : 'BRONZE CHEST (NEEDS ANKH KEY)',
      title: 'ANCIENT CHEST',
      position: new THREE.Vector3(10.2, 0.5, -43.5),
      radius: 2.7,
      enabled: () => !this.pearlChestOpened,
      onInteract: (audio) => {
        if (!this.hasAnkhKey) {
          audio.playStoneGrind();
          return {
            kind: 'message',
            title: 'LOCKED BRONZE CHEST',
            text: 'Sealed with an Ankh lock. Search the side alcove inside the Hall of Needles.',
          };
        }
        this.pearlChestOpened = true;
        this.pearlChestLid.rotation.x = -1.3;
        this.artifactsCollected++;
        audio.playTreasureOpen();
        return {
          kind: 'message',
          title: 'ARTIFACT FOUND: CHOLA PEARL SEAL',
          text:
            'A carved gold-and-pearl merchant seal linking ancient Tamilakam to Egypt. Restored +35 Health & +40 Stamina!',
          banner: 'ARTIFACT 1/3: CHOLA PEARL SEAL',
          healHealth: 35,
          healStamina: 40,
        };
      },
    });

    // ========================================================================
    // ROOM 2B: HIDDEN SCRIBE'S VAULT (X: [-22, -12], Z: [-39, -31])
    // ========================================================================
    addRoomShell(-22, -12, -39, -31, 4.8);
    addBox(-23.2, -22.0, 0, 4.8, -39.5, -30.5, stoneMat); // West back
    addBox(-22.5, -12.0, 0, 4.8, -31.0, -30.0, stoneMat); // South wall
    addBox(-22.5, -12.0, 0, 4.8, -40.0, -39.0, stoneMat); // North wall

    // Sliding Cracked False Wall at X = -12, Z = -35
    this.secretWallMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.0, 4.4), crackedMat);
    this.secretWallMesh.position.set(-12.2, 2.0, -35.0);
    this.group.add(this.secretWallMesh);
    this.cameraOccluders.push(this.secretWallMesh);
    this.losOccluders.push(this.secretWallMesh);
    this.secretWallCollider = {
      type: 'box',
      minX: -12.7,
      maxX: -11.7,
      minZ: -37.2,
      maxZ: -32.8,
      minY: -0.5,
      maxY: 4.2,
    };
    this.colliders.push(this.secretWallCollider);

    // Loose Keystone switch on West Wall
    this.keystoneMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.36, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0xd9a84a,
        emissive: 0x1e5c52,
        emissiveIntensity: 0.45,
        flatShading: true,
      })
    );
    this.keystoneMesh.position.set(-11.88, 1.35, -31.8);
    this.group.add(this.keystoneMesh);

    this.interactives.push({
      id: 'secret-keystone',
      label: 'PRESS LOOSE KEYSTONE',
      title: 'CONCEALED PASSAGE',
      position: new THREE.Vector3(-11.4, 1.1, -31.8),
      radius: 2.6,
      enabled: () => !this.secretOpened,
      onInteract: (audio) => {
        this.secretOpened = true;
        this.keystoneMesh.position.x = -11.98;
        this.secretWallCollider.maxY = -10; // Disable wall collider
        const losIdx = this.losOccluders.indexOf(this.secretWallMesh);
        if (losIdx >= 0) this.losOccluders.splice(losIdx, 1);
        audio.playStoneGrind();
        audio.playPuzzleChime(1, true);
        return {
          kind: 'message',
          title: 'HIDDEN PASSAGE REVEALED',
          text: 'Stone counterweights groan behind the cracked masonry, sliding open a secret vault!',
          banner: 'SECRET ROOM DISCOVERED: SCRIBE’S VAULT',
        };
      },
    });

    // Contents of Secret Vault
    addTorch(-16.5, 2.5, -31.3, true, 12);
    addSarcophagus(-19.8, 0, -35.0, 0);
    this.secretChestLid = buildChest(-15.5, 0, -37.2, 0, true);

    this.interactives.push(
      {
        id: 'secret-vault-chest',
        label: 'OPEN SECRET VAULT CHEST',
        title: 'ROYAL SCARAB IDOL',
        position: new THREE.Vector3(-15.5, 0.5, -37.2),
        radius: 2.7,
        enabled: () => !this.secretChestOpened,
        onInteract: (audio) => {
          this.secretChestOpened = true;
          this.secretChestLid.rotation.x = -1.3;
          this.artifactsCollected++;
          audio.playTreasureOpen();
          return {
            kind: 'message',
            title: 'ARTIFACT FOUND: ROYAL SCARAB IDOL',
            text:
              'A lapis-and-gold scarab blessed by star-readers. Restored +30 Health & +50 Stamina!',
            banner: 'ARTIFACT 2/3: ROYAL SCARAB IDOL',
            healHealth: 30,
            healStamina: 50,
          };
        },
      },
      {
        id: 'scribe-sarcophagus',
        label: 'INSPECT SCRIBE SARCOPHAGUS',
        title: 'CHAMBER OF STAR TRADERS',
        position: new THREE.Vector3(-18.2, 0.8, -35.0),
        radius: 2.8,
        enabled: () => true,
        onInteract: (audio) => {
          audio.playStoneResonance();
          return {
            kind: 'message',
            title: 'CHAMBER OF STAR TRADERS',
            text:
              '"To open the Inner Sanctuary’s Golden Treasury, turn the three dials from West to East: SUN · AYTHAM (ஃ) · SCARAB."',
          };
        },
      }
    );

    // ========================================================================
    // CORRIDOR 3: CRUSHER PASSAGE (X: [-3.5, 3.5], Z: [-62, -46])
    // ========================================================================
    addRoomShell(-3.5, 3.5, -62, -46, 5.0);
    addBox(-4.8, -3.5, 0, 5.0, -62.4, -46.0, stoneMat); // West wall
    addBox(3.5, 4.8, 0, 5.0, -62.4, -46.0, stoneMat); // East wall
    addTorch(-3.2, 2.6, -54.0, true, 13);

    // Moving Stone Crushers at Z = -51 and Z = -57.5
    const buildCrusher = (zCenter: number, phaseOffset: number, speed: number) => {
      // Visible dark guide track on floor
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.04, 2.3),
        new THREE.MeshBasicMaterial({ color: 0x24160c })
      );
      track.position.set(0, 0.02, zCenter);
      this.group.add(track);

      const block = new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.3, 2.1), crackedMat);
      block.position.set(0, 1.65, zCenter);
      block.castShadow = !this.isSoftwareGl;
      block.receiveShadow = true;
      this.group.add(block);
      this.cameraOccluders.push(block);

      const collider: TombBoxCollider = {
        type: 'box',
        minX: -1.45,
        maxX: 1.45,
        minZ: zCenter - 1.05,
        maxZ: zCenter + 1.05,
        minY: -0.5,
        maxY: 3.5,
      };
      this.colliders.push(collider);

      this.crushers.push({
        mesh: block,
        collider,
        zCenter,
        minX: -1.95,
        maxX: 1.95,
        halfW: 1.45,
        halfD: 1.05,
        phaseOffset,
        speed,
        lastDir: 1,
        hitCooldown: 0,
      });
    };

    buildCrusher(-51.0, 0, 1.55);
    buildCrusher(-57.5, Math.PI, 1.75);

    // ========================================================================
    // ROOM 3: INNER SANCTUARY (X: [-11, 11], Z: [-84, -62]) — PUZZLE B
    // ========================================================================
    addRoomShell(-11, 11, -84, -62, 6.4);
    addBox(-11.6, -3.5, 0, 6.4, -62.8, -61.8, stoneMat); // South-west wall
    addBox(3.5, 11.6, 0, 6.4, -62.8, -61.8, stoneMat); // South-east wall
    addBox(-11.8, 11.8, 0, 6.4, -85.0, -84.0, stoneMat); // North back wall
    addBox(-12.2, -11.0, 0, 6.4, -84.5, -62.0, stoneMat); // West wall
    addBox(11.0, 12.2, 0, 6.4, -70.5, -62.0, stoneMat); // East-south wall
    addBox(11.0, 12.2, 0, 6.4, -84.5, -75.5, stoneMat); // East-north wall
    addBox(11.0, 12.2, 4.2, 6.4, -75.8, -70.2, darkStoneMat); // Treasury Door lintel

    // Raised North Pharaoh Dais
    addBox(-11, 11, 0, 0.35, -84, -78.5, darkStoneMat, false, false);

    // Guardian Statues flanking Royal Sarcophagus
    const buildGuardianStatue = (x: number, z: number) => {
      const sg = new THREE.Group();
      sg.position.set(x, 0.35, z);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.7), darkStoneMat);
      plinth.position.y = 0.45;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.8), stoneMat);
      body.position.y = 2.0;
      const jackalHead = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.85), bronzeMat);
      jackalHead.position.set(0, 3.35, 0.15);
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 4), goldMat);
      earL.position.set(-0.2, 3.9, 0.0);
      const earR = earL.clone();
      earR.position.x = 0.2;
      sg.add(plinth, body, jackalHead, earL, earR);
      this.group.add(sg);
      this.cameraOccluders.push(plinth, body);
      this.losOccluders.push(plinth, body);
      this.colliders.push({
        type: 'box',
        minX: x - 0.95,
        maxX: x + 0.95,
        minZ: z - 0.95,
        maxZ: z + 0.95,
        minY: -0.2,
        maxY: 4.6,
      });
    };

    buildGuardianStatue(-7.8, -80.2);
    buildGuardianStatue(7.8, -80.2);
    addSarcophagus(0, 0.35, -81.2, Math.PI * 0.5);

    addBrazier(-5.2, 0, -64.0, true);
    addBrazier(5.2, 0, -64.0, true);
    addBrazier(-4.8, 0.35, -80.0, true);
    addBrazier(4.8, 0.35, -80.0, true);

    // Sealed Treasury Vault Door (X = 11.4, Z = [-75.5, -70.5])
    this.vaultDoor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 4.2, 5.0), goldMat);
    this.vaultDoor.position.set(11.4, 2.1, -73.0);
    this.group.add(this.vaultDoor);
    this.cameraOccluders.push(this.vaultDoor);
    this.losOccluders.push(this.vaultDoor);
    this.vaultDoorCollider = {
      type: 'box',
      minX: 10.9,
      maxX: 11.9,
      minZ: -75.5,
      maxZ: -70.5,
      minY: -0.5,
      maxY: 4.5,
    };
    this.colliders.push(this.vaultDoorCollider);

    // Target Solution Clues above the Treasury Door (Sun | Aytham | Scarab)
    const targetGlyphs: TombGlyphKind[] = ['sun', 'aytham', 'scarab'];
    targetGlyphs.forEach((gk, idx) => {
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({ map: this.textures.glyphs[gk] })
      );
      badge.position.set(10.92, 4.95, -71.5 - idx * 1.5);
      badge.rotation.y = -Math.PI / 2;
      this.group.add(badge);
    });

    // Clue Plaque next to Treasury Door
    addBox(8.7, 9.7, 0, 1.35, -69.2, -68.4, darkStoneMat, true, false);
    this.interactives.push({
      id: 'vault-keystone-clue',
      label: 'INSPECT VAULT KEYSTONE',
      title: 'CIPHER OF THE THREE WHEELS',
      position: new THREE.Vector3(9.2, 1.0, -68.8),
      radius: 2.7,
      enabled: () => true,
      onInteract: (audio) => {
        audio.playStoneResonance();
        return {
          kind: 'message',
          title: 'CIPHER OF THE THREE WHEELS',
          text:
            '"Look to the Treasury lintel: align the LEFT wheel to SUN, the CENTER wheel to AYTHAM (ஃ), and the RIGHT wheel to SCARAB."',
        };
      },
    });

    // Puzzle B: Three Rotating Stone Mechanism Drums
    const buildRotatingDisc = (
      id: string,
      name: string,
      x: number,
      z: number,
      startIdx: number,
      targetGlyph: TombGlyphKind
    ) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.55, 8), darkStoneMat);
      base.position.set(x, 0.275, z);
      this.group.add(base);

      const drumGroup = new THREE.Group();
      drumGroup.position.set(x, 1.15, z);

      // Four-sided rotating block with each glyph mapped onto a cardinal face
      const sideMats = [
        new THREE.MeshStandardMaterial({ map: this.textures.glyphs.scarab, flatShading: true }), // +X
        new THREE.MeshStandardMaterial({ map: this.textures.glyphs.aytham, flatShading: true }), // -X
        new THREE.MeshStandardMaterial({ color: 0x6b4c2d, roughness: 0.9, flatShading: true }), // +Y
        new THREE.MeshStandardMaterial({ color: 0x4c351e, roughness: 0.9, flatShading: true }), // -Y
        new THREE.MeshStandardMaterial({ map: this.textures.glyphs.sun, flatShading: true }), // +Z (index 0 faces south!)
        new THREE.MeshStandardMaterial({ map: this.textures.glyphs.serpent, flatShading: true }), // -Z
      ];
      const drumBlock = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.15, 1.12), sideMats);
      drumGroup.add(drumBlock);

      const crownCap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.16, 4), goldMat);
      crownCap.rotation.y = Math.PI / 4;
      crownCap.position.y = 0.65;
      drumGroup.add(crownCap);
      this.group.add(drumGroup);

      // Front indicator crystal showing which face is active (+Z south side)
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xc99640,
        emissive: 0x3b2407,
        emissiveIntensity: 0.4,
        flatShading: true,
      });
      const pointer = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), ringMat);
      pointer.position.set(x, 0.62, z + 0.88);
      this.group.add(pointer);

      this.colliders.push({
        type: 'cylinder',
        x,
        z,
        radius: 0.95,
        minY: -0.2,
        maxY: 2.2,
      });

      const disc: RotatingDisc = {
        id,
        name,
        drumGroup,
        ringMat,
        currentIndex: startIdx,
        visualYaw: -startIdx * (Math.PI / 2),
        targetIndex: GLYPH_ORDER.indexOf(targetGlyph),
      };
      drumGroup.rotation.y = disc.visualYaw;
      this.discs.push(disc);

      this.interactives.push({
        id: `disc-${id}`,
        label: () =>
          `ROTATE ${name} DISC (${GLYPH_LABELS[GLYPH_ORDER[disc.currentIndex]]})`,
        title: `${name} STONE WHEEL`,
        position: new THREE.Vector3(x, 1.0, z),
        radius: 2.7,
        enabled: () => !this.puzzleBSolved,
        onInteract: (audio) => this.rotateDisc(disc, audio),
      });
    };

    // Faces map: 0(+Z)=sun, 1(+X)=scarab (-PI/2 brings +X to +Z), 2(-Z)=serpent, 3(-X)=aytham
    buildRotatingDisc('left', 'LEFT', -4.6, -68.5, 1, 'sun');
    buildRotatingDisc('center', 'CENTER', 0.0, -72.0, 2, 'aytham');
    buildRotatingDisc('right', 'RIGHT', 4.6, -68.5, 0, 'scarab');

    // ========================================================================
    // ROOM 4A: GRAND GUARDIAN ARENA (X: [11, 37], Z: [-85, -61])
    // ========================================================================
    addRoomShell(11, 37, -85, -61, 8.2);
    addBox(11.0, 12.2, 0, 8.2, -70.5, -60.5, stoneMat); // West-south nib
    addBox(11.0, 12.2, 0, 8.2, -85.5, -75.5, stoneMat); // West-north nib
    addBox(11.0, 12.2, 4.2, 8.2, -75.8, -70.2, darkStoneMat); // West arch lintel
    addBox(11.0, 37.5, 0, 8.2, -61.0, -59.8, stoneMat); // South Arena wall
    addBox(11.0, 37.5, 0, 8.2, -86.2, -85.0, stoneMat); // North Arena wall
    addBox(37.0, 38.2, 0, 8.2, -70.5, -60.5, stoneMat); // East-south sanctum nib
    addBox(37.0, 38.2, 0, 8.2, -85.5, -75.5, stoneMat); // East-north sanctum nib
    addBox(37.0, 38.2, 4.2, 8.2, -75.8, -70.2, darkStoneMat); // Sanctum archway lintel

    // Four carved Arena Pillars (tactical cover vs Underworld Bolts)
    const arenaPillars: [number, number][] = [
      [18.5, -66.5],
      [18.5, -79.5],
      [28.5, -66.5],
      [28.5, -79.5],
    ];
    arenaPillars.forEach(([px, pz]) => {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 1.04, 8.2, 8),
        darkStoneMat
      );
      col.position.set(px, 4.1, pz);
      col.castShadow = !this.isSoftwareGl;
      col.receiveShadow = true;
      this.group.add(col);
      this.cameraOccluders.push(col);
      this.losOccluders.push(col);
      this.colliders.push({
        type: 'cylinder',
        x: px,
        z: pz,
        radius: 1.08,
        minY: -0.5,
        maxY: 8.4,
      });
    });

    // Wall mystical glyph panels around Boss Arena that ignite on Awakening
    const glyphWalls: Array<[number, number, number, TombGlyphKind]> = [
      [18.0, -60.92, 0, 'aytham'],
      [28.0, -60.92, 0, 'sun'],
      [18.0, -84.92, Math.PI, 'scarab'],
      [28.0, -84.92, Math.PI, 'aytham'],
    ];
    glyphWalls.forEach(([gx, gz, ry, gkind]) => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.textures.glyphs[gkind],
        emissive: 0x1e5c52,
        emissiveIntensity: 0.25,
        flatShading: true,
      });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), mat);
      pl.position.set(gx, 3.6, gz);
      pl.rotation.y = ry;
      this.group.add(pl);
      this.bossWallGlyphMats.push(mat);
    });

    // Dedicated Arena Braziers
    const arenaBraziers: [number, number][] = [
      [14.2, -64.0],
      [14.2, -82.0],
      [34.0, -64.0],
      [34.0, -82.0],
    ];
    arenaBraziers.forEach(([bx, bz]) => {
      addBrazier(bx, 0, bz, true);
      const lastLight = this.pointLights[this.pointLights.length - 1];
      if (lastLight) {
        this.bossArenaTorches.push({
          light: lastLight.light,
          baseIntensity: lastLight.baseIntensity,
        });
      }
    });

    // Arena Seal Barriers:
    // 1) West Entrance Seal (hidden until boss awakens, locks arena during fight)
    this.bossEntranceBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 4.2, 5.0),
      new THREE.MeshBasicMaterial({
        color: 0x3bf0d8,
        transparent: true,
        opacity: 0.42,
      })
    );
    this.bossEntranceBarrier.position.set(11.6, 2.1, -73.0);
    this.bossEntranceBarrier.visible = false;
    this.group.add(this.bossEntranceBarrier);
    this.bossEntranceCollider = {
      type: 'box',
      minX: 11.2,
      maxX: 12.0,
      minZ: -75.5,
      maxZ: -70.5,
      minY: -0.5,
      maxY: -10, // Unlocked until boss awakens
    };
    this.colliders.push(this.bossEntranceCollider);

    // 2) East Treasure Sanctum Seal (locked until boss is defeated)
    this.bossTreasureBarrier = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 4.2, 5.0),
      new THREE.MeshBasicMaterial({
        color: 0xffc64b,
        transparent: true,
        opacity: 0.48,
      })
    );
    this.bossTreasureBarrier.position.set(37.4, 2.1, -73.0);
    this.group.add(this.bossTreasureBarrier);
    this.bossTreasureCollider = {
      type: 'box',
      minX: 37.0,
      maxX: 37.8,
      minZ: -75.5,
      maxZ: -70.5,
      minY: -0.5,
      maxY: 4.5, // Locked until Guardian is defeated!
    };
    this.colliders.push(this.bossTreasureCollider);

    // Mount Anubis-Inspired Guardian Boss inside Arena
    this.group.add(this.bossArenaGroup);
    (this as unknown as { boss: BossGuardian }).boss = new BossGuardian(
      this.bossArenaGroup,
      this.isSoftwareGl
    );

    // ========================================================================
    // ROOM 4B: INNER TREASURE SANCTUM (X: [37, 45.5], Z: [-78.5, -67.5])
    // ========================================================================
    addRoomShell(37, 45.5, -78.5, -67.5, 6.0);
    addBox(45.5, 46.7, 0, 6.0, -79.0, -67.0, stoneMat); // East back
    addBox(37.0, 46.0, 0, 6.0, -67.5, -66.5, stoneMat); // South wall
    addBox(37.0, 46.0, 0, 6.0, -79.5, -78.5, stoneMat); // North wall
    addBox(37.0, 38.2, 0, 6.0, -70.5, -67.0, stoneMat); // West-south nib
    addBox(37.0, 38.2, 0, 6.0, -79.0, -75.5, stoneMat); // West-north nib

    addBrazier(39.5, 0, -69.5, true);
    addBrazier(39.5, 0, -76.5, true);

    // Scattered gold piles
    for (let i = 0; i < 6; i++) {
      const mound = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.36, 6), goldMat);
      mound.position.set(40.2 + (i % 2) * 2.2, 0.18, -70.0 - Math.floor(i / 2) * 3.0);
      this.group.add(mound);
    }

    // Treasury Chest
    this.treasuryChestLid = buildChest(40.2, 0, -76.8, 0, true);
    this.interactives.push({
      id: 'treasury-gold-chest',
      label: 'OPEN TREASURY CHEST',
      title: 'PHARAOH’S OFFERING',
      position: new THREE.Vector3(40.2, 0.5, -76.8),
      radius: 2.7,
      enabled: () => !this.treasuryChestOpened && this.boss.state === 'defeated',
      onInteract: (audio) => {
        this.treasuryChestOpened = true;
        this.treasuryChestLid.rotation.x = -1.3;
        audio.playTreasureOpen();
        return {
          kind: 'message',
          title: 'ROYAL GOLD & ELIXIR VIALS',
          text: 'Ancient spices and sacred oils restore your strength completely (+100 Health & +100 Stamina)!',
          banner: 'HEALTH & STAMINA FULLY RESTORED',
          healHealth: 100,
          healStamina: 100,
        };
      },
    });

    // Royal Artifact Altar: Crown of Korkai & Ra
    addBox(42.2, 43.8, 0, 1.0, -73.8, -72.2, darkStoneMat, true, false);
    this.crownGroup = new THREE.Group();
    this.crownGroup.position.set(43.0, 1.38, -73.0);
    const circlet = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.22, 8), goldMat);
    const sunCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), goldMat);
    sunCrest.position.y = 0.24;
    this.crownGroup.add(circlet, sunCrest);
    this.group.add(this.crownGroup);

    this.interactives.push({
      id: 'crown-artifact',
      label: 'CLAIM SACRED CROWN OF KORKAI & RA',
      title: 'LEGENDARY ARTIFACT',
      position: new THREE.Vector3(43.0, 0.8, -73.0),
      radius: 2.9,
      enabled: () => !this.crownClaimed && this.boss.state === 'defeated',
      onInteract: (audio) => {
        this.crownClaimed = true;
        this.crownGroup.visible = false;
        this.artifactsCollected++;
        audio.playPuzzleChime(3, true);
        audio.playTreasureOpen();
        return {
          kind: 'victory',
          title: 'LEGENDARY ARTIFACT: CROWN OF KORKAI & RA',
          text:
            'Forged where Chola pearl ships met the golden Nile. Inscribed with the Three Dots (ஃ), its recovery fulfills your expedition into the Sunken Tomb!',
          banner: 'CROWN OF KORKAI & RA RECLAIMED!',
          healHealth: 100,
          healStamina: 100,
        };
      },
    });

    // ========================================================================
    // TOMB DUST MOTES
    // ========================================================================
    const dustCount = 120;
    const dPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dPos[i * 3] = (Math.random() - 0.5) * 32;
      dPos[i * 3 + 1] = 0.4 + Math.random() * 4.5;
      dPos[i * 3 + 2] = -Math.random() * 82 + 4;
    }
    const dustGeo = new THREE.BufferGeometry();
    const dustAttr = new THREE.BufferAttribute(dPos, 3);
    dustGeo.setAttribute('position', dustAttr);
    const dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xffcf88,
        size: 0.12,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    );
    dustPoints.frustumCulled = false;
    this.group.add(dustPoints);

    return { dustPoints, dustAttr };
  }

  private activatePuzzleAPedestal(
    sym: SymbolA,
    label: string,
    audio: TombAudioHooks
  ): TombInteractionOutcome {
    if (this.puzzleASolved) return { kind: 'none' };

    const expected = PUZZLE_A_ORDER[this.puzzleAStep];
    if (sym === expected) {
      this.pedestalCrystalMats[sym].emissive.setHex(0x2cd49f);
      this.pedestalCrystalMats[sym].emissiveIntensity = 1.4;
      this.gateASockets[this.puzzleAStep].emissive.setHex(0xffc94d);
      this.gateASockets[this.puzzleAStep].emissiveIntensity = 1.6;
      this.puzzleAStep++;

      if (this.puzzleAStep >= PUZZLE_A_ORDER.length) {
        this.puzzleASolved = true;
        this.gateACollider.maxY = -10;
        const losIdx = this.losOccluders.indexOf(this.gateADoor);
        if (losIdx >= 0) this.losOccluders.splice(losIdx, 1);
        audio.playPuzzleChime(3, true);
        audio.playStoneGrind();
        return {
          kind: 'message',
          title: 'SEALED STONE GATE OPENED',
          text: 'All three wards resonate in harmony! The massive sandstone gate to the north grinds open.',
          banner: 'PUZZLE SOLVED: NORTHERN GATE UNSEALED',
        };
      }

      audio.playPuzzleChime(this.puzzleAStep, false);
      return {
        kind: 'message',
        title: `${label} WARD AWAKENED`,
        text: `Gate rune ${this.puzzleAStep} of 3 lit with golden fire.`,
        banner: `WARD ${this.puzzleAStep}/3 ACTIVATED`,
      };
    }

    // Wrong order -> reset sockets smoothly
    this.puzzleAStep = 0;
    (['sun', 'lotus', 'aytham'] as SymbolA[]).forEach((k) => {
      this.pedestalCrystalMats[k].emissive.setHex(0x2a1a05);
      this.pedestalCrystalMats[k].emissiveIntensity = 0.4;
    });
    this.gateASockets.forEach((m) => {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    });
    audio.playStoneGrind();
    return {
      kind: 'message',
      title: 'SEQUENCE BROKEN',
      text: 'The wards dim and reset. Check the Decree Mural near the south entrance: Sun (I), Lotus (II), Aytham (III).',
      banner: 'PUZZLE RESET — CHECK SEQUENCE CLUE',
    };
  }

  private rotateDisc(disc: RotatingDisc, audio: TombAudioHooks): TombInteractionOutcome {
    if (this.puzzleBSolved) return { kind: 'none' };
    disc.currentIndex = (disc.currentIndex + 1) % GLYPH_ORDER.length;
    audio.playStoneGrind();

    const aligned = disc.currentIndex === disc.targetIndex;
    disc.ringMat.emissive.setHex(aligned ? 0x2cd49f : 0x3b2407);
    disc.ringMat.emissiveIntensity = aligned ? 1.4 : 0.4;

    if (this.discs.every((d) => d.currentIndex === d.targetIndex)) {
      this.puzzleBSolved = true;
      this.vaultDoorCollider.maxY = -10;
      const losIdx = this.losOccluders.indexOf(this.vaultDoor);
      if (losIdx >= 0) this.losOccluders.splice(losIdx, 1);
      audio.playPuzzleChime(3, true);
      return {
        kind: 'message',
        title: 'TREASURY CHAMBER UNLOCKED',
        text: 'All three sanctuary wheels align! The golden Treasury Door on the east wall rises open.',
        banner: 'PUZZLE SOLVED: TREASURY CHAMBER OPEN',
      };
    }

    return { kind: 'none' };
  }

  public getNearestPrompt(playerPos: THREE.Vector3): TombInteractPrompt | null {
    let best: TombInteractPrompt | null = null;
    let bestDistSq = Infinity;

    for (const node of this.interactives) {
      if (!node.enabled()) continue;
      const dSq = playerPos.distanceToSquared(node.position);
      if (dSq <= node.radius * node.radius && dSq < bestDistSq) {
        bestDistSq = dSq;
        best = {
          id: node.id,
          label: typeof node.label === 'function' ? node.label() : node.label,
          title: node.title,
        };
      }
    }
    return best;
  }

  public triggerNearestInteraction(
    playerPos: THREE.Vector3,
    audio: TombAudioHooks
  ): TombInteractionOutcome | null {
    let bestNode: TombInteractiveNode | null = null;
    let bestDistSq = Infinity;

    for (const node of this.interactives) {
      if (!node.enabled()) continue;
      const dSq = playerPos.distanceToSquared(node.position);
      if (dSq <= node.radius * node.radius && dSq < bestDistSq) {
        bestDistSq = dSq;
        bestNode = node;
      }
    }
    if (!bestNode) return null;
    return bestNode.onInteract(audio);
  }

  public getHudState(): TombHudState {
    return {
      artifacts: this.artifactsCollected,
      maxArtifacts: 3,
      hasAnkhKey: this.hasAnkhKey,
      puzzleASolved: this.puzzleASolved,
      puzzleBSolved: this.puzzleBSolved,
      secretOpened: this.secretOpened,
    };
  }

  public getBossHudState(): BossHudSnapshot {
    return this.boss.getHudState();
  }

  public onPlayerAttackStart(): void {
    this.boss.clearSwingCache();
  }

  public checkPlayerAttack(
    playerPos: THREE.Vector3,
    hitCenter: THREE.Vector3,
    spearRange: number,
    spearHitRadius: number,
    damage: number,
    audio: TombAudioHooks,
    onBossDamaged: () => void
  ): void {
    this.boss.checkPlayerSpearHit(
      playerPos,
      hitCenter,
      spearRange,
      spearHitRadius,
      damage,
      audio,
      onBossDamaged
    );
  }

  public unlockAllDoors(): void {
    this.puzzleASolved = true;
    this.puzzleAStep = PUZZLE_A_ORDER.length;
    this.gateACollider.maxY = -10;
    this.gateAOpenAmount = 4.5;
    this.gateADoor.position.y = 2.15 + 4.5;

    this.secretOpened = true;
    this.secretWallCollider.maxY = -10;
    this.secretOpenAmount = 4.5;
    this.secretWallMesh.position.z = -35.0 - 4.5;

    this.puzzleBSolved = true;
    this.vaultDoorCollider.maxY = -10;
    this.vaultDoorOpenAmount = 4.4;
    this.vaultDoor.position.y = 2.1 + 4.4;
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    activeControl: boolean,
    audio: TombAudioHooks,
    onHazardHit: (damage: number, sourcePos: THREE.Vector3, banner?: string) => void,
    onCameraShake: (amount: number) => void,
    onBanner: (text: string, tone: 'gold' | 'danger') => void
  ): void {
    // 1. Torchlight organic flicker
    for (const t of this.pointLights) {
      const f =
        Math.sin(elapsed * 9.5 + t.seed) * 0.55 +
        Math.sin(elapsed * 17.3 + t.seed * 1.9) * 0.35;
      t.light.intensity = t.baseIntensity + f;
      t.flameMesh.scale.setScalar(1 + f * 0.08);
    }

    // 2. Pickup & Crown gentle hover spin
    if (!this.hasAnkhKey) {
      this.keyPickupMesh.rotation.y = elapsed * 1.8;
      this.keyPickupMesh.position.y = 1.05 + Math.sin(elapsed * 3.0) * 0.08;
    }
    if (!this.crownClaimed) {
      this.crownGroup.rotation.y = elapsed * 1.1;
      this.crownGroup.position.y = 1.38 + Math.sin(elapsed * 2.5) * 0.07;
    }

    // 3. Doors & Secret Wall animations
    if (this.puzzleASolved && this.gateAOpenAmount < 4.5) {
      this.gateAOpenAmount = Math.min(4.5, this.gateAOpenAmount + dt * 2.4);
      this.gateADoor.position.y = 2.15 + this.gateAOpenAmount;
    }
    if (this.secretOpened && this.secretOpenAmount < 4.5) {
      this.secretOpenAmount = Math.min(4.5, this.secretOpenAmount + dt * 2.6);
      this.secretWallMesh.position.z = -35.0 - this.secretOpenAmount;
    }
    if (this.puzzleBSolved && this.vaultDoorOpenAmount < 4.4) {
      this.vaultDoorOpenAmount = Math.min(4.4, this.vaultDoorOpenAmount + dt * 2.4);
      this.vaultDoor.position.y = 2.1 + this.vaultDoorOpenAmount;
    }

    // 4. Smoothly interpolate Rotating Discs
    for (const d of this.discs) {
      const targetYaw = -d.currentIndex * (Math.PI / 2);
      d.visualYaw += (targetYaw - d.visualYaw) * Math.min(1, dt * 11);
      d.drumGroup.rotation.y = d.visualYaw;
    }

    // 5. Pressure Plates & Wall Dart Traps
    for (const pt of this.pressureTraps) {
      if (pt.cooldown > 0) pt.cooldown -= dt;
      const stepped =
        Math.abs(playerPos.x - pt.plateX) < 0.95 &&
        Math.abs(playerPos.z - pt.plateZ) < 0.85 &&
        playerPos.y < 0.45;

      if (stepped && !pt.wasStepped && pt.cooldown <= 0) {
        pt.cooldown = 1.85;
        audio.playPressurePlateClick();
        audio.playDartTrapFire();
        (pt.nozzleLightMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xff5a18);
        (pt.nozzleLightMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8;

        for (const zo of pt.zOffsets) {
          const slot = this.darts.find((d) => !d.active);
          if (slot) {
            slot.active = true;
            slot.life = 1.2;
            slot.pos.set(pt.wallX, 1.15, pt.plateZ + zo);
            slot.vel.set(pt.dirX * 11.5, 0, 0);
            slot.mesh.position.copy(slot.pos);
            slot.mesh.rotation.y = pt.dirX > 0 ? 0 : Math.PI;
            slot.mesh.visible = true;
          }
        }
      }
      pt.wasStepped = stepped;
      const targetY = stepped ? 0.03 : 0.09;
      pt.plateMesh.position.y += (targetY - pt.plateMesh.position.y) * Math.min(1, dt * 14);
      const nMat = pt.nozzleLightMesh.material as THREE.MeshStandardMaterial;
      nMat.emissiveIntensity = Math.max(0.3, nMat.emissiveIntensity - dt * 2.5);
    }

    // Update active darts
    for (const d of this.darts) {
      if (!d.active) continue;
      d.life -= dt;
      d.pos.addScaledVector(d.vel, dt);
      d.mesh.position.copy(d.pos);

      if (
        Math.abs(d.pos.x) > 3.25 ||
        d.life <= 0
      ) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }

      const dx = playerPos.x - d.pos.x;
      const dz = playerPos.z - d.pos.z;
      if (Math.hypot(dx, dz) < 0.65 && playerPos.y < 1.65 && playerPos.y + 1.6 > d.pos.y) {
        d.active = false;
        d.mesh.visible = false;
        onHazardHit(18, d.pos, 'DART TRAP HIT!');
      }
    }

    // 6. Retractable Floor Spikes
    for (const st of this.spikeTraps) {
      if (st.hitCooldown > 0) st.hitCooldown -= dt;
      st.cycleTime = (st.cycleTime + dt) % 3.6;
      const prevPhase = st.phase;
      if (st.cycleTime < 1.7) st.phase = 'idle';
      else if (st.cycleTime < 2.45) st.phase = 'warning';
      else st.phase = 'active';

      if (st.phase !== prevPhase && Math.abs(playerPos.z - (st.minZ + st.maxZ) * 0.5) < 16) {
        if (st.phase === 'warning') audio.playSpikeWarning();
        if (st.phase === 'active') audio.playSpikeSnap();
      }

      const targetSpikeY = st.phase === 'active' ? 0.05 : st.phase === 'warning' ? -0.82 : -1.08;
      st.spikesGroup.position.y +=
        (targetSpikeY - st.spikesGroup.position.y) * Math.min(1, dt * (st.phase === 'active' ? 24 : 9));

      st.warningMat.emissive.setHex(
        st.phase === 'warning' ? 0xd45b18 : st.phase === 'active' ? 0x7c1c12 : 0x000000
      );

      if (
        st.phase === 'active' &&
        st.hitCooldown <= 0 &&
        playerPos.x >= st.minX &&
        playerPos.x <= st.maxX &&
        playerPos.z >= st.minZ &&
        playerPos.z <= st.maxZ &&
        playerPos.y < 0.95
      ) {
        st.hitCooldown = 0.85;
        onHazardHit(
          22,
          new THREE.Vector3((st.minX + st.maxX) * 0.5, 0.5, (st.minZ + st.maxZ) * 0.5),
          'FLOOR SPIKES!'
        );
      }
    }

    // 7. Moving Stone Crusher Obstacles
    for (const c of this.crushers) {
      if (c.hitCooldown > 0) c.hitCooldown -= dt;
      const s = Math.sin(elapsed * c.speed + c.phaseOffset);
      const dir = Math.cos(elapsed * c.speed + c.phaseOffset) >= 0 ? 1 : -1;
      if (dir !== c.lastDir) {
        c.lastDir = dir;
        if (Math.abs(playerPos.z - c.zCenter) < 18) {
          audio.playStoneGrind();
        }
      }
      const xCenter = THREE.MathUtils.lerp(c.minX, c.maxX, s * 0.5 + 0.5);
      c.mesh.position.x = xCenter;
      c.collider.minX = xCenter - c.halfW;
      c.collider.maxX = xCenter + c.halfW;

      const hitMargin = 0.56;
      if (
        c.hitCooldown <= 0 &&
        playerPos.x >= c.collider.minX - hitMargin &&
        playerPos.x <= c.collider.maxX + hitMargin &&
        playerPos.z >= c.zCenter - c.halfD - hitMargin &&
        playerPos.z <= c.zCenter + c.halfD + hitMargin &&
        playerPos.y < 3.2
      ) {
        c.hitCooldown = 0.95;
        onHazardHit(24, c.mesh.position, 'STONE CRUSHER IMPACT!');
      }
    }

    // 8. Tomb Dust Motes drift around arena & corridors
    for (let i = 0; i < this.dustAttr.count; i++) {
      let x = this.dustAttr.getX(i) + dt * 0.32;
      let y = this.dustAttr.getY(i) + Math.sin(elapsed * 0.9 + i) * dt * 0.12;
      let z = this.dustAttr.getZ(i) + Math.cos(elapsed * 0.5 + i) * dt * 0.14;
      if (x > 46) x = -22;
      if (x < -22) x = 46;
      if (y < 0.3) y = 4.6;
      if (y > 5.0) y = 0.5;
      this.dustAttr.setXYZ(i, x, y, z);
    }
    this.dustAttr.needsUpdate = true;

    // 9. Final Boss Arena Awakening, Mystical Symbols & 3-Phase Guardian Combat
    if (
      activeControl &&
      this.boss.state === 'dormant' &&
      playerPos.x >= 19.5 &&
      playerPos.x <= 37.0 &&
      playerPos.z >= -84.0 &&
      playerPos.z <= -62.0
    ) {
      this.bossEntranceBarrier.visible = true;
      this.bossEntranceCollider.maxY = 4.5;
      this.boss.startAwakening(audio);
      onBanner('ANPU-KAR AWAKENS!', 'danger');
    }

    const bossIntensity =
      this.boss.state === 'awakening' || this.boss.isAwake()
        ? this.boss.phase === 3
          ? 2.2
          : 1.5
        : 0.25;
    for (const m of this.bossWallGlyphMats) {
      m.emissiveIntensity += (bossIntensity - m.emissiveIntensity) * Math.min(1, dt * 4);
      m.emissive.setHex(
        this.boss.state === 'defeated'
          ? 0x473314
          : this.boss.phase === 3
          ? 0xd42b1c
          : 0x1e8f80
      );
    }
    for (const bt of this.bossArenaTorches) {
      if (this.boss.state === 'awakening' || this.boss.isAwake()) {
        bt.light.intensity =
          bt.baseIntensity * 1.45 + Math.sin(elapsed * 22) * 1.6;
      }
    }

    this.boss.update(
      dt,
      elapsed,
      playerPos,
      activeControl,
      audio,
      (dmg, srcPos, banner) => {
        onHazardHit(dmg, srcPos, banner);
      },
      onCameraShake,
      () => {
        onBanner('PREPARE FOR TRIAL BY SCALES!', 'danger');
      },
      () => {
        // Boss defeated: open Treasure Sanctum & West Entrance Seal
        this.bossTreasureBarrier.visible = false;
        this.bossTreasureCollider.maxY = -10;
        this.bossEntranceBarrier.visible = false;
        this.bossEntranceCollider.maxY = -10;
        audio.playPuzzleChime(3, true);
        onBanner('THE GUARDIAN FALLS — TREASURE SANCTUM UNSEALED!', 'gold');
      }
    );
  }

  public reset(): void {
    this.puzzleAStep = 0;
    this.puzzleASolved = false;
    this.gateAOpenAmount = 0;
    this.gateADoor.position.y = 2.15;
    this.gateACollider.maxY = 4.5;
    if (!this.losOccluders.includes(this.gateADoor)) this.losOccluders.push(this.gateADoor);
    (['sun', 'lotus', 'aytham'] as SymbolA[]).forEach((k) => {
      this.pedestalCrystalMats[k].emissive.setHex(0x2a1a05);
      this.pedestalCrystalMats[k].emissiveIntensity = 0.4;
    });
    this.gateASockets.forEach((m) => {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    });

    this.secretOpened = false;
    this.secretOpenAmount = 0;
    this.secretWallMesh.position.z = -35.0;
    this.secretWallCollider.maxY = 4.2;
    this.keystoneMesh.position.x = -11.88;
    if (!this.losOccluders.includes(this.secretWallMesh)) {
      this.losOccluders.push(this.secretWallMesh);
    }

    this.puzzleBSolved = false;
    this.vaultDoorOpenAmount = 0;
    this.vaultDoor.position.y = 2.1;
    this.vaultDoorCollider.maxY = 4.5;
    if (!this.losOccluders.includes(this.vaultDoor)) this.losOccluders.push(this.vaultDoor);
    const startIndices = [1, 2, 0];
    this.discs.forEach((d, idx) => {
      d.currentIndex = startIndices[idx];
      d.visualYaw = -d.currentIndex * (Math.PI / 2);
      d.drumGroup.rotation.y = d.visualYaw;
      d.ringMat.emissive.setHex(0x3b2407);
      d.ringMat.emissiveIntensity = 0.4;
    });

    this.hasAnkhKey = false;
    this.keyPickupMesh.visible = true;
    this.pearlChestOpened = false;
    this.pearlChestLid.rotation.x = 0;
    this.secretChestOpened = false;
    this.secretChestLid.rotation.x = 0;
    this.treasuryChestOpened = false;
    this.treasuryChestLid.rotation.x = 0;
    this.crownClaimed = false;
    this.crownGroup.visible = true;
    this.artifactsCollected = 0;

    for (const d of this.darts) {
      d.active = false;
      d.mesh.visible = false;
    }
    for (const pt of this.pressureTraps) {
      pt.cooldown = 0;
      pt.wasStepped = false;
      pt.plateMesh.position.y = 0.09;
    }
    for (const st of this.spikeTraps) {
      st.cycleTime = 0;
      st.phase = 'idle';
      st.hitCooldown = 0;
      st.spikesGroup.position.y = -1.08;
    }

    this.boss.reset();
    this.bossEntranceBarrier.visible = false;
    this.bossEntranceCollider.maxY = -10;
    this.bossTreasureBarrier.visible = true;
    this.bossTreasureCollider.maxY = 4.5;
    for (const m of this.bossWallGlyphMats) {
      m.emissive.setHex(0x1e5c52);
      m.emissiveIntensity = 0.25;
    }
  }

  public dispose(): void {
    this.textures.dispose();
  }
}
