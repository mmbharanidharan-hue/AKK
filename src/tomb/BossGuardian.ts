import * as THREE from 'three';
import { applyTombPs2Wobble } from './ps2Utils';

export type BossPhase = 1 | 2 | 3;
export type BossState =
  | 'dormant'
  | 'awakening'
  | 'idle'
  | 'chase'
  | 'attack'
  | 'defeating'
  | 'defeated';

export type BossAttackKind =
  | 'melee_cleave'
  | 'sweep_arc'
  | 'ground_slam'
  | 'dark_bolts'
  | 'sand_eruption'
  | 'summon_shades'
  | 'final_judgment';

export interface BossHudSnapshot {
  active: boolean;
  awakening: boolean;
  defeated: boolean;
  name: string;
  subtitle: string;
  health: number;
  maxHealth: number;
  phase: BossPhase;
}

export interface BossAudioHooks {
  playHitImpact: (heavy?: boolean) => void;
  playBossRoar: () => void;
  playBossSlam: () => void;
  playBossCast: () => void;
  playBossDefeat: () => void;
  playSpearWhoosh: () => void;
}

interface DarkBoltProjectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
}

interface SandVortexHazard {
  ringMesh: THREE.Mesh;
  pillarMesh: THREE.Mesh;
  pos: THREE.Vector3;
  timer: number;
  erupted: boolean;
  active: boolean;
}

interface SummonedShade {
  root: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  health: number;
  hitFlash: number;
  attackCooldown: number;
  animTime: number;
  alive: boolean;
}

const BOSS_MAX_HEALTH = 540;
const ARENA_MIN_X = 12.2;
const ARENA_MAX_X = 35.8;
const ARENA_MIN_Z = -83.8;
const ARENA_MAX_Z = -62.2;

export class BossGuardian {
  public readonly root = new THREE.Group();
  public readonly throneGroup = new THREE.Group();
  public state: BossState = 'dormant';
  public phase: BossPhase = 1;
  public health = BOSS_MAX_HEALTH;
  public readonly maxHealth = BOSS_MAX_HEALTH;

  private arenaGroup: THREE.Group;
  private pelvis: THREE.Group;
  private torso: THREE.Group;
  private headGroup: THREE.Group;
  private leftShoulder: THREE.Group;
  private rightShoulder: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private haloOuter: THREE.Group;
  private haloInner: THREE.Group;
  private scepterGroup: THREE.Group;

  private flashMaterials: Array<{ mat: THREE.MeshStandardMaterial; baseEmissive: number }> = [];
  private coreMat!: THREE.MeshStandardMaterial;
  private eyeMat!: THREE.MeshStandardMaterial;
  private runeMat!: THREE.MeshStandardMaterial;
  private shockwaveRing!: THREE.Mesh;
  private shockwaveScale = 0;
  private shockwaveActive = false;

  private hitFlashTimer = 0;
  private stateTimer = 0;
  private attackKind: BossAttackKind = 'melee_cleave';
  private attackTimer = 0;
  private attackWindup = 0.65;
  private attackDuration = 1.15;
  private attackDidHit = false;
  private cooldownTimer = 0.8;
  private animTime = 0;
  private hitByCurrentSwing = false;

  private bolts: DarkBoltProjectile[] = [];
  private vortices: SandVortexHazard[] = [];
  private shades: SummonedShade[] = [];
  private shadeHitsThisSwing = new Set<SummonedShade>();

  private spawnPos = new THREE.Vector3(33.2, 0.45, -73.0);

  constructor(arenaGroup: THREE.Group, isSoftwareGl: boolean) {
    this.arenaGroup = arenaGroup;

    // ------------------------------------------------------------------------
    // Materials: Ancient Black Obsidian, Dark Gold & Mystical Underworld Teal
    // ------------------------------------------------------------------------
    const obsidianMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0x1a1720,
        roughness: 0.48,
        metalness: 0.42,
        flatShading: true,
      })
    );
    const darkGoldMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0xd4a036,
        roughness: 0.28,
        metalness: 0.86,
        flatShading: true,
      })
    );
    const bronzePlateMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0x6b4b22,
        roughness: 0.42,
        metalness: 0.72,
        flatShading: true,
      })
    );
    const wrapMat = applyTombPs2Wobble(
      new THREE.MeshStandardMaterial({
        color: 0x4b1414,
        roughness: 0.82,
        metalness: 0.08,
        flatShading: true,
      })
    );
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x3bf0d8,
      emissive: 0x109c8a,
      emissiveIntensity: 1.4,
      roughness: 0.25,
      flatShading: true,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x7effec,
      emissive: 0x26e6cb,
      emissiveIntensity: 2.0,
    });
    this.runeMat = new THREE.MeshStandardMaterial({
      color: 0xffc64b,
      emissive: 0xd98718,
      emissiveIntensity: 1.2,
      flatShading: true,
    });

    this.flashMaterials.push(
      { mat: obsidianMat, baseEmissive: obsidianMat.emissive.getHex() },
      { mat: darkGoldMat, baseEmissive: darkGoldMat.emissive.getHex() },
      { mat: bronzePlateMat, baseEmissive: bronzePlateMat.emissive.getHex() }
    );

    // ------------------------------------------------------------------------
    // Throne / Ancient Obsidian Sarcophagus Dais at (33.2, 0, -73)
    // ------------------------------------------------------------------------
    this.throneGroup.position.set(33.5, 0, -73.0);
    const dais = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 6.2), obsidianMat);
    dais.position.y = 0.225;
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.4, 3.2), obsidianMat);
    backrest.position.set(1.3, 2.4, 0);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 2.4), bronzePlateMat);
    seat.position.set(0.3, 0.85, 0);
    const throneCrown = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.runeMat);
    throneCrown.position.set(1.1, 4.9, 0);
    this.throneGroup.add(dais, backrest, seat, throneCrown);
    this.arenaGroup.add(this.throneGroup);

    // ------------------------------------------------------------------------
    // Imposing Jackal-Headed Humanoid Warrior (~3.2m tall)
    // ------------------------------------------------------------------------
    this.root.position.copy(this.spawnPos);
    this.root.rotation.y = -Math.PI * 0.5; // Facing West toward player entrance

    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 1.45;
    this.root.add(this.pelvis);

    const waistArmor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.62), darkGoldMat);
    const kiltFront = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.92, 0.14), wrapMat);
    kiltFront.position.set(0, -0.45, 0.28);
    const kiltBack = kiltFront.clone();
    kiltBack.position.z = -0.28;
    const beltScale = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), this.coreMat);
    beltScale.position.set(0, 0.04, 0.34);
    this.pelvis.add(waistArmor, kiltFront, kiltBack, beltScale);

    // Legs
    const makeLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.3, -0.1, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.68, 0.34), obsidianMat);
      thigh.position.y = -0.34;
      const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.68, 6), darkGoldMat);
      greave.position.y = -0.96;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.48), obsidianMat);
      boot.position.set(0, -1.32, 0.08);
      hip.add(thigh, greave, boot);
      hip.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = !isSoftwareGl;
      });
      this.pelvis.add(hip);
      return hip;
    };
    this.leftLeg = makeLeg(1);
    this.rightLeg = makeLeg(-1);

    // Broad Torso & Sacred Collar
    this.torso = new THREE.Group();
    this.torso.position.y = 0.25;
    this.pelvis.add(this.torso);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.44, 1.02, 6), obsidianMat);
    chest.position.y = 0.5;
    chest.scale.set(1.18, 1.0, 0.72);
    chest.castShadow = !isSoftwareGl;

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.11, 5, 8), darkGoldMat);
    collar.rotation.x = Math.PI * 0.46;
    collar.position.set(0, 0.94, 0);

    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), this.coreMat);
    chestCore.position.set(0, 0.56, 0.36);

    const ribLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.46), darkGoldMat);
    ribLeft.position.set(0.32, 0.64, 0.16);
    ribLeft.rotation.z = -0.25;
    const ribRight = ribLeft.clone();
    ribRight.position.x = -0.32;
    ribRight.rotation.z = 0.25;
    this.torso.add(chest, collar, chestCore, ribLeft, ribRight);

    // Counter-Rotating Mystical Judgment Halo behind shoulders
    this.haloOuter = new THREE.Group();
    this.haloOuter.position.set(0, 0.85, -0.45);
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 5, 12), darkGoldMat);
    this.haloOuter.add(ringOuter);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), this.runeMat);
      gem.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0);
      this.haloOuter.add(gem);
    }
    this.haloInner = new THREE.Group();
    this.haloInner.position.set(0, 0.85, -0.42);
    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.04, 5, 8), this.coreMat);
    this.haloInner.add(ringInner);
    this.torso.add(this.haloOuter, this.haloInner);

    // Sculpted Jackal Head & Ceremonial Crest
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.05;
    this.torso.add(this.headGroup);

    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.54), obsidianMat);
    cranium.position.y = 0.28;
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.48), obsidianMat);
    snout.position.set(0, 0.22, 0.36);
    const muzzleGold = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.26), darkGoldMat);
    muzzleGold.position.set(0, 0.14, 0.42);
    const browGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), this.runeMat);
    browGem.position.set(0, 0.42, 0.28);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.06), this.eyeMat);
    eyeL.position.set(0.12, 0.33, 0.27);
    eyeL.rotation.z = -0.22;
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.12;
    eyeR.rotation.z = 0.22;

    const makeEar = (side: number) => {
      const ear = new THREE.Group();
      ear.position.set(side * 0.17, 0.52, -0.04);
      ear.rotation.z = -side * 0.1;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.64, 4), obsidianMat);
      blade.position.y = 0.28;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.12, 4), darkGoldMat);
      cuff.position.y = 0.18;
      ear.add(blade, cuff);
      return ear;
    };
    const nemesL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.32), darkGoldMat);
    nemesL.position.set(0.28, 0.14, 0.04);
    nemesL.rotation.z = -0.18;
    const nemesR = nemesL.clone();
    nemesR.position.x = -0.28;
    nemesR.rotation.z = 0.18;

    this.headGroup.add(
      cranium,
      snout,
      muzzleGold,
      browGem,
      eyeL,
      eyeR,
      makeEar(1),
      makeEar(-1),
      nemesL,
      nemesR
    );

    // Arms & Great Crook-Halberd of Judgment
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.position.set(0.76, 0.88, 0);
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.44), darkGoldMat);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.92, 0.24), obsidianMat);
    armL.position.y = -0.48;
    const scaleGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 6), darkGoldMat);
    scaleGuard.rotation.z = Math.PI / 2;
    scaleGuard.position.set(0.16, -0.78, 0.18);
    const guardCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this.coreMat);
    guardCore.position.set(0.22, -0.78, 0.18);
    this.leftShoulder.add(pauldronL, armL, scaleGuard, guardCore);
    this.torso.add(this.leftShoulder);

    this.rightShoulder = new THREE.Group();
    this.rightShoulder.position.set(-0.76, 0.88, 0);
    const pauldronR = pauldronL.clone();
    const armR = armL.clone();
    this.rightShoulder.add(pauldronR, armR);
    this.torso.add(this.rightShoulder);

    // Halberd held in right gauntlet
    this.scepterGroup = new THREE.Group();
    this.scepterGroup.position.set(0, -0.92, 0.12);
    this.scepterGroup.rotation.x = Math.PI * 0.45;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.1, 6), bronzePlateMat);
    shaft.position.y = 0.55;
    const headRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 5, 8), darkGoldMat);
    headRing.position.y = 2.02;
    const halberdBlade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.48), obsidianMat);
    halberdBlade.position.set(0, 2.25, 0.28);
    const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.09), this.coreMat);
    edgeGlow.position.set(0, 2.25, 0.52);
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), darkGoldMat);
    spearTip.position.y = 2.68;
    this.scepterGroup.add(shaft, headRing, halberdBlade, edgeGlow, spearTip);
    this.rightShoulder.add(this.scepterGroup);

    // Expanding Ground Slam / Judgment Shockwave Ring
    this.shockwaveRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1.0, 24),
      new THREE.MeshBasicMaterial({
        color: 0x45f5dd,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.shockwaveRing.rotation.x = -Math.PI / 2;
    this.shockwaveRing.position.y = 0.12;
    this.shockwaveRing.visible = false;
    this.arenaGroup.add(this.shockwaveRing);

    this.arenaGroup.add(this.root);

    // Pool Dark Energy Bolt Projectiles
    const boltGeo = new THREE.OctahedronGeometry(0.26, 0);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0x3bf0d8 });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(boltGeo, boltMat);
      m.visible = false;
      this.arenaGroup.add(m);
      this.bolts.push({
        mesh: m,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        active: false,
      });
    }

    // Pool Sand Eruption Vortices (Phase 2 & 3)
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.35, 16),
        new THREE.MeshBasicMaterial({
          color: 0xff9b34,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      const pillar = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 3.8, 7),
        new THREE.MeshBasicMaterial({
          color: 0xe6a64c,
          transparent: true,
          opacity: 0.72,
        })
      );
      pillar.visible = false;
      this.arenaGroup.add(ring, pillar);
      this.vortices.push({
        ringMesh: ring,
        pillarMesh: pillar,
        pos: new THREE.Vector3(),
        timer: 0,
        erupted: false,
        active: false,
      });
    }

    this.setDormantPose();
  }

  private setDormantPose(): void {
    this.root.position.copy(this.spawnPos);
    this.root.rotation.y = -Math.PI * 0.5;
    this.root.visible = true;
    this.pelvis.position.y = 0.92; // Kneeling/slumped on throne dais
    this.torso.rotation.x = 0.25;
    this.headGroup.rotation.x = 0.38;
    this.eyeMat.emissiveIntensity = 0.15;
    this.coreMat.emissiveIntensity = 0.25;
    this.leftShoulder.rotation.set(-0.6, 0, 0);
    this.rightShoulder.rotation.set(-0.6, 0, 0);
    this.leftLeg.rotation.x = -0.8;
    this.rightLeg.rotation.x = -0.8;
  }

  public startAwakening(audio: BossAudioHooks): void {
    if (this.state !== 'dormant') return;
    this.state = 'awakening';
    this.stateTimer = 0;
    audio.playBossRoar();
  }

  public isAwake(): boolean {
    return this.state !== 'dormant' && this.state !== 'defeated';
  }

  public getCameraFocusPoint(out: THREE.Vector3): THREE.Vector3 {
    out.set(this.root.position.x, this.root.position.y + 2.1, this.root.position.z);
    return out;
  }

  public clearSwingCache(): void {
    this.hitByCurrentSwing = false;
    this.shadeHitsThisSwing.clear();
  }

  public checkPlayerSpearHit(
    playerPos: THREE.Vector3,
    hitCenter: THREE.Vector3,
    spearRange: number,
    spearHitRadius: number,
    damage: number,
    audio: BossAudioHooks,
    onBossDamaged: () => void
  ): void {
    // Hit active Shades first
    for (const sh of this.shades) {
      if (!sh.alive || this.shadeHitsThisSwing.has(sh)) continue;
      const dt = Math.hypot(sh.root.position.x - hitCenter.x, sh.root.position.z - hitCenter.z);
      const dp = Math.hypot(sh.root.position.x - playerPos.x, sh.root.position.z - playerPos.z);
      if (dt <= spearHitRadius || dp <= spearRange * 0.55) {
        this.shadeHitsThisSwing.add(sh);
        sh.health -= damage;
        sh.hitFlash = 0.15;
        audio.playHitImpact(false);
        if (sh.health <= 0) {
          sh.alive = false;
          sh.root.visible = false;
        }
      }
    }

    if (
      this.hitByCurrentSwing ||
      this.state === 'dormant' ||
      this.state === 'awakening' ||
      this.state === 'defeating' ||
      this.state === 'defeated'
    ) {
      return;
    }

    const distTip = Math.hypot(
      this.root.position.x - hitCenter.x,
      this.root.position.z - hitCenter.z
    );
    const distPlayer = Math.hypot(
      this.root.position.x - playerPos.x,
      this.root.position.z - playerPos.z
    );

    if (distTip <= spearHitRadius + 0.85 || distPlayer <= spearRange * 0.65) {
      this.hitByCurrentSwing = true;
      this.health = Math.max(0, this.health - damage);
      this.hitFlashTimer = 0.14;
      audio.playHitImpact(false);
      onBossDamaged();

      const ratio = this.health / this.maxHealth;
      if (ratio <= 0) {
        this.triggerDefeat(audio);
      } else if (ratio <= 0.33 && this.phase < 3) {
        this.phase = 3;
        audio.playBossRoar();
      } else if (ratio <= 0.66 && this.phase < 2) {
        this.phase = 2;
        audio.playBossRoar();
      }
    }
  }

  private triggerDefeat(audio: BossAudioHooks): void {
    this.state = 'defeating';
    this.stateTimer = 0;
    this.attackTimer = 0;
    this.shockwaveActive = false;
    this.shockwaveRing.visible = false;
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
    for (const v of this.vortices) {
      v.active = false;
      v.ringMesh.visible = false;
      v.pillarMesh.visible = false;
    }
    for (const sh of this.shades) {
      sh.alive = false;
      sh.root.visible = false;
    }
    audio.playBossDefeat();
  }

  public getHudState(): BossHudSnapshot {
    const subtitle =
      this.phase === 1
        ? 'PHASE I · THE GUARDIAN'
        : this.phase === 2
        ? 'PHASE II · WRATH OF THE UNDERWORLD'
        : 'PHASE III · FINAL JUDGMENT';
    return {
      active:
        this.state !== 'dormant' &&
        this.state !== 'defeated',
      awakening: this.state === 'awakening',
      defeated: this.state === 'defeated',
      name: 'ANPU-KAR · KEEPER OF THE SCALES',
      subtitle,
      health: this.health,
      maxHealth: this.maxHealth,
      phase: this.phase,
    };
  }

  private chooseNextAttack(distToPlayer: number): void {
    const pool: BossAttackKind[] = ['melee_cleave', 'sweep_arc', 'ground_slam'];
    if (this.phase >= 2) {
      pool.push('dark_bolts', 'sand_eruption');
      if (distToPlayer > 5.2) pool.push('dark_bolts', 'sand_eruption');
      const liveShades = this.shades.filter((s) => s.alive).length;
      if (liveShades < 2 && Math.random() < 0.35) {
        pool.push('summon_shades');
      }
    }
    if (this.phase === 3) {
      pool.push('final_judgment');
      if (distToPlayer < 5.5) pool.push('final_judgment');
    }

    this.attackKind = pool[Math.floor(Math.random() * pool.length)];
    this.attackTimer = 0;
    this.attackDidHit = false;
    this.state = 'attack';

    const speedFactor = this.phase === 1 ? 1.0 : this.phase === 2 ? 0.84 : 0.72;
    switch (this.attackKind) {
      case 'melee_cleave':
        this.attackWindup = 0.68 * speedFactor;
        this.attackDuration = 1.18 * speedFactor;
        break;
      case 'sweep_arc':
        this.attackWindup = 0.62 * speedFactor;
        this.attackDuration = 1.15 * speedFactor;
        break;
      case 'ground_slam':
        this.attackWindup = 0.85 * speedFactor;
        this.attackDuration = 1.45 * speedFactor;
        break;
      case 'dark_bolts':
        this.attackWindup = 0.64 * speedFactor;
        this.attackDuration = 1.12 * speedFactor;
        break;
      case 'sand_eruption':
        this.attackWindup = 0.7 * speedFactor;
        this.attackDuration = 1.2 * speedFactor;
        break;
      case 'summon_shades':
        this.attackWindup = 0.75 * speedFactor;
        this.attackDuration = 1.3 * speedFactor;
        break;
      case 'final_judgment':
        this.attackWindup = 1.05;
        this.attackDuration = 1.75;
        break;
    }
  }

  private spawnShade(x: number, z: number): void {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3338,
      emissive: 0x0c423c,
      emissiveIntensity: 0.7,
      roughness: 0.8,
      flatShading: true,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 1.3, 6), bodyMat);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.34), bodyMat);
    head.position.y = 1.68;
    const eyes = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x6bffec })
    );
    eyes.position.set(0, 1.7, 0.17);
    root.add(body, head, eyes);
    this.arenaGroup.add(root);
    this.shades.push({
      root,
      bodyMat,
      health: 35,
      hitFlash: 0,
      attackCooldown: 0.9,
      animTime: 0,
      alive: true,
    });
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    activeControl: boolean,
    audio: BossAudioHooks,
    onPlayerHit: (damage: number, sourcePos: THREE.Vector3, banner?: string) => void,
    onCameraShake: (amount: number) => void,
    onAwakeningDone: () => void,
    onDefeatedDone: () => void
  ): void {
    this.animTime += dt;

    // Update Hit Flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flash = this.hitFlashTimer > 0 ? 0xff4c2b : null;
      this.flashMaterials.forEach(({ mat, baseEmissive }) => {
        mat.emissive.setHex(flash !== null ? flash : baseEmissive);
      });
    }

    // Rotate mystical Halo
    const haloSpin = this.phase === 3 ? 2.4 : this.phase === 2 ? 1.4 : 0.7;
    this.haloOuter.rotation.z = elapsed * haloSpin;
    this.haloInner.rotation.z = -elapsed * haloSpin * 1.4;
    const phaseColor = this.phase === 3 ? 0xff4530 : this.phase === 2 ? 0x3bf0d8 : 0xffc64b;
    this.coreMat.emissive.setHex(this.phase === 3 ? 0xd42214 : 0x109c8a);
    this.runeMat.emissive.setHex(phaseColor);

    // Update Shockwave Ring
    if (this.shockwaveActive) {
      this.shockwaveScale += dt * 11.0;
      this.shockwaveRing.scale.setScalar(this.shockwaveScale);
      const sm = this.shockwaveRing.material as THREE.MeshBasicMaterial;
      sm.opacity = Math.max(0, 0.85 - (this.shockwaveScale / 6.2) * 0.85);
      if (this.shockwaveScale >= 6.2) {
        this.shockwaveActive = false;
        this.shockwaveRing.visible = false;
      }
    }

    // Update Projectiles
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y += dt * 6;
      if (
        b.life <= 0 ||
        b.pos.x < ARENA_MIN_X - 1 ||
        b.pos.x > ARENA_MAX_X + 1 ||
        b.pos.z < ARENA_MIN_Z - 1 ||
        b.pos.z > ARENA_MAX_Z + 1
      ) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      if (
        activeControl &&
        Math.hypot(playerPos.x - b.pos.x, playerPos.z - b.pos.z) < 0.75 &&
        playerPos.y < 1.8
      ) {
        b.active = false;
        b.mesh.visible = false;
        onPlayerHit(18, b.pos, 'UNDERWORLD BOLT!');
      }
    }

    // Update Sand Vortices
    for (const v of this.vortices) {
      if (!v.active) continue;
      v.timer += dt;
      v.ringMesh.rotation.z += dt * 5;
      if (!v.erupted && v.timer >= 0.9) {
        v.erupted = true;
        v.pillarMesh.visible = true;
        v.pillarMesh.position.set(v.pos.x, 1.9, v.pos.z);
        audio.playBossSlam();
        if (
          activeControl &&
          Math.hypot(playerPos.x - v.pos.x, playerPos.z - v.pos.z) < 1.45 &&
          playerPos.y < 2.6
        ) {
          onPlayerHit(20, v.pos, 'SAND VORTEX ERUPTION!');
        }
      }
      if (v.erupted) {
        v.pillarMesh.rotation.y += dt * 9;
      }
      if (v.timer >= 1.55) {
        v.active = false;
        v.ringMesh.visible = false;
        v.pillarMesh.visible = false;
      }
    }

    // Update Summoned Shades
    for (const sh of this.shades) {
      if (!sh.alive) continue;
      sh.animTime += dt;
      if (sh.hitFlash > 0) {
        sh.hitFlash = Math.max(0, sh.hitFlash - dt);
        sh.bodyMat.emissive.setHex(sh.hitFlash > 0 ? 0xff4522 : 0x0c423c);
      }
      if (sh.attackCooldown > 0) sh.attackCooldown -= dt;
      const sx = playerPos.x - sh.root.position.x;
      const sz = playerPos.z - sh.root.position.z;
      const sd = Math.hypot(sx, sz) || 1;
      sh.root.rotation.y = Math.atan2(sx, sz);
      sh.root.position.y = Math.sin(sh.animTime * 4) * 0.08;
      if (activeControl && sd > 1.35) {
        sh.root.position.x += (sx / sd) * 3.1 * dt;
        sh.root.position.z += (sz / sd) * 3.1 * dt;
      } else if (activeControl && sd <= 1.55 && sh.attackCooldown <= 0) {
        sh.attackCooldown = 1.45;
        onPlayerHit(12, sh.root.position, 'SHADOW SHADE STRIKE!');
      }
    }

    // State Machine
    if (this.state === 'dormant') {
      return;
    }

    if (this.state === 'awakening') {
      this.stateTimer += dt;
      const p = Math.min(1, this.stateTimer / 3.2);
      onCameraShake(0.12);
      // Rise dramatically from stone dais onto arena floor
      this.root.position.x = THREE.MathUtils.lerp(33.2, 29.8, p);
      this.root.position.y = THREE.MathUtils.lerp(0.45, 0, p);
      this.pelvis.position.y = THREE.MathUtils.lerp(0.92, 1.45, p);
      this.torso.rotation.x = THREE.MathUtils.lerp(0.25, 0.05, p);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(0.38, 0, p);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(-0.8, 0, p);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(-0.8, 0, p);
      this.rightShoulder.rotation.set(THREE.MathUtils.lerp(-0.6, -1.9, Math.sin(p * Math.PI)), 0, 0);
      this.eyeMat.emissiveIntensity = THREE.MathUtils.lerp(0.15, 2.2, p);
      this.coreMat.emissiveIntensity = THREE.MathUtils.lerp(0.25, 1.8, p);

      if (this.stateTimer >= 3.3) {
        this.state = 'chase';
        this.cooldownTimer = 0.65;
        onAwakeningDone();
      }
      return;
    }

    if (this.state === 'defeating') {
      this.stateTimer += dt;
      const p = Math.min(1, this.stateTimer / 2.8);
      this.pelvis.position.y = THREE.MathUtils.lerp(1.45, 0.35, p);
      this.torso.rotation.x = THREE.MathUtils.lerp(0.05, 1.25, p);
      this.eyeMat.emissiveIntensity = Math.max(0, 2.0 * (1 - p));
      this.coreMat.emissiveIntensity = Math.max(0, 1.8 * (1 - p));
      this.root.scale.setScalar(1 - p * 0.25);
      if (this.stateTimer >= 2.9) {
        this.state = 'defeated';
        this.root.visible = false;
        onDefeatedDone();
      }
      return;
    }

    if (this.state === 'defeated' || !activeControl) {
      return;
    }

    const dx = playerPos.x - this.root.position.x;
    const dz = playerPos.z - this.root.position.z;
    const dist = Math.hypot(dx, dz) || 0.01;
    const targetYaw = Math.atan2(dx, dz);

    if (this.cooldownTimer > 0) this.cooldownTimer -= dt;

    if (this.state === 'chase' || this.state === 'idle') {
      let deltaYaw = targetYaw - this.root.rotation.y;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      this.root.rotation.y += deltaYaw * Math.min(1, dt * 6.5);

      const moveSpd = this.phase === 1 ? 3.25 : this.phase === 2 ? 4.0 : 4.75;
      if (dist > 3.1) {
        this.root.position.x += (dx / dist) * moveSpd * dt;
        this.root.position.z += (dz / dist) * moveSpd * dt;
      }

      // Walk anim
      const w = Math.sin(this.animTime * 6.0);
      this.leftLeg.rotation.x = w * 0.45;
      this.rightLeg.rotation.x = -w * 0.45;
      this.torso.rotation.x = 0.08;
      this.leftShoulder.rotation.set(-0.35 + w * 0.15, 0, 0.12);
      this.rightShoulder.rotation.set(-0.65 - w * 0.15, 0, -0.1);

      if (this.cooldownTimer <= 0 && (dist <= 3.7 || this.phase >= 2)) {
        this.chooseNextAttack(dist);
      }
    } else if (this.state === 'attack') {
      this.attackTimer += dt;
      const p = Math.min(1, this.attackTimer / this.attackDuration);
      const windupFrac = this.attackWindup / this.attackDuration;

      // Track player during early windup
      if (p < windupFrac * 0.85) {
        let deltaYaw = targetYaw - this.root.rotation.y;
        while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
        while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
        this.root.rotation.y += deltaYaw * Math.min(1, dt * 5.5);
      }

      // Telegraph vs strike animation
      if (p < windupFrac) {
        const w = p / windupFrac;
        this.torso.rotation.x = -0.24 * w;
        if (this.attackKind === 'sweep_arc') {
          this.rightShoulder.rotation.set(-0.8, 0.9 * w, -0.8 * w);
        } else {
          this.rightShoulder.rotation.set(-0.7 - 1.95 * w, 0, -0.15);
        }
        if (this.attackKind === 'final_judgment' || this.attackKind === 'dark_bolts') {
          this.leftShoulder.rotation.set(-1.7 * w, 0, 0.4 * w);
        }
      } else {
        const s = (p - windupFrac) / (1 - windupFrac);
        const slam = Math.sin(Math.min(1, s * 1.8) * (Math.PI / 2));
        this.torso.rotation.x = -0.24 + 0.56 * slam;
        if (this.attackKind === 'sweep_arc') {
          this.rightShoulder.rotation.set(-0.9, 0.9 - 2.3 * slam, -0.5);
        } else {
          this.rightShoulder.rotation.set(-2.65 + 2.35 * slam, 0, 0);
        }
      }

      // Execute strike effect once at windup completion
      if (!this.attackDidHit && this.attackTimer >= this.attackWindup) {
        this.attackDidHit = true;
        this.executeAttackStrike(playerPos, dist, dx, dz, audio, onPlayerHit, onCameraShake);
      }

      if (this.attackTimer >= this.attackDuration) {
        this.state = 'chase';
        this.cooldownTimer = this.phase === 1 ? 1.1 : this.phase === 2 ? 0.78 : 0.48;
      }
    }

    // Clamp Boss inside dedicated Boss Arena
    this.root.position.x = THREE.MathUtils.clamp(this.root.position.x, ARENA_MIN_X, ARENA_MAX_X);
    this.root.position.z = THREE.MathUtils.clamp(this.root.position.z, ARENA_MIN_Z, ARENA_MAX_Z);
  }

  private executeAttackStrike(
    playerPos: THREE.Vector3,
    dist: number,
    dx: number,
    dz: number,
    audio: BossAudioHooks,
    onPlayerHit: (damage: number, sourcePos: THREE.Vector3, banner?: string) => void,
    onCameraShake: (amount: number) => void
  ): void {
    const fwdX = Math.sin(this.root.rotation.y);
    const fwdZ = Math.cos(this.root.rotation.y);
    const dot = (fwdX * dx + fwdZ * dz) / dist;

    if (this.attackKind === 'melee_cleave') {
      audio.playSpearWhoosh();
      if (dist <= 3.7 && dot > 0.25) {
        onPlayerHit(24, this.root.position);
      }
    } else if (this.attackKind === 'sweep_arc') {
      audio.playSpearWhoosh();
      if (dist <= 3.9 && dot > -0.25) {
        onPlayerHit(20, this.root.position);
      }
    } else if (this.attackKind === 'ground_slam') {
      audio.playBossSlam();
      onCameraShake(0.35);
      this.shockwaveRing.position.set(this.root.position.x, 0.14, this.root.position.z);
      this.shockwaveScale = 0.8;
      this.shockwaveActive = true;
      this.shockwaveRing.visible = true;
      if (dist <= 4.7 && playerPos.y < 1.1) {
        onPlayerHit(26, this.root.position, 'SEISMIC SLAM!');
      }
    } else if (this.attackKind === 'dark_bolts') {
      audio.playBossCast();
      const baseAngle = Math.atan2(dx, dz);
      [-0.24, 0, 0.24].forEach((offset) => {
        const slot = this.bolts.find((b) => !b.active);
        if (slot) {
          const ang = baseAngle + offset;
          slot.active = true;
          slot.life = 2.6;
          slot.pos.set(this.root.position.x, 1.35, this.root.position.z);
          slot.vel.set(Math.sin(ang) * 11.2, 0, Math.cos(ang) * 11.2);
          slot.mesh.position.copy(slot.pos);
          slot.mesh.visible = true;
        }
      });
    } else if (this.attackKind === 'sand_eruption') {
      audio.playBossCast();
      const count = this.phase === 3 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const slot = this.vortices.find((v) => !v.active);
        if (slot) {
          slot.active = true;
          slot.erupted = false;
          slot.timer = 0;
          const ox = i === 0 ? 0 : (Math.random() - 0.5) * 4.5;
          const oz = i === 0 ? 0 : (Math.random() - 0.5) * 4.5;
          slot.pos.set(
            THREE.MathUtils.clamp(playerPos.x + ox, ARENA_MIN_X + 1, ARENA_MAX_X - 1),
            0.08,
            THREE.MathUtils.clamp(playerPos.z + oz, ARENA_MIN_Z + 1, ARENA_MAX_Z - 1)
          );
          slot.ringMesh.position.copy(slot.pos);
          slot.ringMesh.visible = true;
          slot.pillarMesh.visible = false;
        }
      }
    } else if (this.attackKind === 'summon_shades') {
      audio.playBossCast();
      this.spawnShade(
        THREE.MathUtils.clamp(this.root.position.x - 2.5, ARENA_MIN_X + 1, ARENA_MAX_X - 1),
        THREE.MathUtils.clamp(this.root.position.z + (Math.random() - 0.5) * 4, ARENA_MIN_Z + 1, ARENA_MAX_Z - 1)
      );
    } else if (this.attackKind === 'final_judgment') {
      audio.playBossSlam();
      audio.playBossRoar();
      onCameraShake(0.45);
      // Lunge forward + massive shockwave judgment burst
      this.root.position.x += fwdX * 2.4;
      this.root.position.z += fwdZ * 2.4;
      this.shockwaveRing.position.set(this.root.position.x, 0.15, this.root.position.z);
      this.shockwaveScale = 1.0;
      this.shockwaveActive = true;
      this.shockwaveRing.visible = true;
      if (dist <= 5.8) {
        onPlayerHit(34, this.root.position, 'FINAL JUDGMENT!');
      }
    }
  }

  public reset(): void {
    this.state = 'dormant';
    this.phase = 1;
    this.health = this.maxHealth;
    this.hitFlashTimer = 0;
    this.stateTimer = 0;
    this.attackTimer = 0;
    this.cooldownTimer = 0.8;
    this.shockwaveActive = false;
    this.shockwaveRing.visible = false;
    this.root.scale.setScalar(1);
    this.flashMaterials.forEach(({ mat, baseEmissive }) => {
      mat.emissive.setHex(baseEmissive);
    });
    for (const b of this.bolts) {
      b.active = false;
      b.mesh.visible = false;
    }
    for (const v of this.vortices) {
      v.active = false;
      v.ringMesh.visible = false;
      v.pillarMesh.visible = false;
    }
    for (const sh of this.shades) {
      this.arenaGroup.remove(sh.root);
    }
    this.shades = [];
    this.setDormantPose();
  }
}
