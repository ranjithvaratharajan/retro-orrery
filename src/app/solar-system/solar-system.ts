import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  OnDestroy,
  HostListener,
  inject,
  signal,
  computed,
  NgZone,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, DatePipe } from '@angular/common';
import * as THREE from 'three';
import { CelestialMathService, OrbitalElements } from '../services/celestial-math';
import { AudioService } from '../services/audio.service';

// ─── Planet metadata (info panel data) ───────────────────────────────────────
interface PlanetInfo {
  period: string;   // Orbital period
  distance: string; // Avg distance from Sun
  diameter: string; // Diameter
  fact: string;     // Interesting fact
}

const PLANET_INFO: Record<string, PlanetInfo> = {
  Mercury: { period: '87.97 Earth days', distance: '0.39 AU',  diameter: '4,879 km',   fact: 'Has virtually no atmosphere, leading to extreme temperature swings of over 600°C.' },
  Venus:   { period: '224.7 Earth days', distance: '0.72 AU',  diameter: '12,104 km',  fact: 'Rotates backwards compared to most planets, so the Sun rises in the west.' },
  Earth:   { period: '365.25 days',      distance: '1.00 AU',  diameter: '12,742 km',  fact: 'The only known planet harboring life, with a large stabilizing Moon.' },
  Mars:    { period: '686.97 Earth days',distance: '1.52 AU',  diameter: '6,779 km',   fact: 'Home to Olympus Mons — the tallest volcano in the solar system at 21 km high.' },
  Jupiter: { period: '11.86 Earth years',distance: '5.20 AU',  diameter: '139,820 km', fact: 'The Great Red Spot is a storm larger than Earth, raging for over 350 years.' },
  Saturn:  { period: '29.46 Earth years',distance: '9.54 AU',  diameter: '116,460 km', fact: 'Saturn is less dense than water — it would float in a large enough ocean.' },
  Uranus:  { period: '84.01 Earth years',distance: '19.19 AU', diameter: '50,724 km',  fact: 'Rotates on its side with an axial tilt of 97.77°, likely from an ancient collision.' },
  Neptune: { period: '164.8 Earth years',distance: '30.07 AU', diameter: '49,244 km',  fact: 'Has the fastest winds in the solar system, reaching 2,100 km/h.' },
  Sun:     { period: '—', distance: '0 AU', diameter: '1,392,000 km', fact: 'Contains 99.86% of all mass in the solar system.' },
};

// ─── Time speed modes ─────────────────────────────────────────────────────────
type SpeedMode = 'realtime' | '1day' | '1month';

const SPEED_LABELS: Record<SpeedMode, string> = {
  realtime: 'Real',
  '1day':   '1D/s',
  '1month': '1M/s',
};

// days-per-millisecond for each mode (actual realtime = 1/86400000)
const SPEED_DAYS_PER_MS: Record<SpeedMode, number> = {
  realtime: 1 / 86400000,
  '1day':   1 / 1000,
  '1month': 30 / 1000,
};

@Component({
  selector: 'app-solar-system',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ui-overlay">

      <!-- ── HEADER ───────────────────────────────────────────── -->
      <div class="header-panel retro-box">
        <h1 class="title">RETRO ORRERY <span class="title-version">v2.0</span></h1>
        <div class="date-display">{{ currentDate() | date:'mediumDate' }}</div>
        <div class="scale-mode-display" [class.warning]="scaleMode() === 'logarithmic'">
          MODE: {{ scaleMode() === 'accurate' ? 'ACCURATE (1:1)' : 'LOGARITHMIC (VISUAL)' }}
        </div>
      </div>

      <!-- ── AUDIO CONTROL ────────────────────────────────────── -->
      <div class="audio-control">
        <button
          id="audio-mute-btn"
          class="audio-btn"
          [class.muted]="audio.isMuted()"
          (click)="onToggleMute()"
          [attr.aria-label]="audio.isMuted() ? 'Unmute sounds' : 'Mute sounds'"
          [attr.title]="audio.isMuted() ? 'Unmute' : 'Mute'">
          {{ audio.isMuted() ? '🔇' : '🔔' }}
        </button>
      </div>

      <!-- ── PLANET SELECTOR ───────────────────────────────────── -->
      <div class="planet-list retro-box" role="navigation" aria-label="Planet selector">
        <div class="list-header">TARGET SYSTEM</div>
        <ul role="list">
          @for (p of planetList(); track p.name) {
            <li
              role="listitem"
              tabindex="0"
              [id]="'planet-btn-' + p.name.toLowerCase()"
              [class.active]="focusedPlanet() === p.name"
              [attr.aria-pressed]="focusedPlanet() === p.name"
              [attr.aria-label]="p.name + (focusedPlanet() === p.name ? ' (focused)' : '')"
              (click)="focusPlanet(p.name)"
              (keydown.enter)="focusPlanet(p.name)"
              (keydown.space)="focusPlanet(p.name); $event.preventDefault()">
              <span class="planet-icon" [style.backgroundColor]="'#' + p.color.toString(16).padStart(6,'0')"></span>
              {{ p.name }}
            </li>
          }
        </ul>
        <button
          id="reset-view-btn"
          class="reset-btn"
          (click)="resetView()"
          aria-label="Reset camera to default view">
          ◁ RESET VIEW
        </button>
      </div>

      <!-- ── PLANET INFO PANEL ─────────────────────────────────── -->
      <div class="planet-info-panel retro-box" [class.visible]="!!focusedPlanet() && focusedPlanet() !== 'Sun'" aria-live="polite">
        @if (focusedPlanet() && focusedPlanet() !== 'Sun') {
          <button class="planet-info-close" (click)="resetView()" aria-label="Close planet info">✕</button>
          <div class="planet-info-name">{{ focusedPlanet() }}</div>
          <div class="planet-info-divider"></div>
          @if (focusedPlanetInfo(); as info) {
            <div class="planet-stat">
              <span class="planet-stat-label">Orbital Period</span>
              <span class="planet-stat-value">{{ info.period }}</span>
            </div>
            <div class="planet-stat">
              <span class="planet-stat-label">Distance from Sun</span>
              <span class="planet-stat-value">{{ info.distance }}</span>
            </div>
            <div class="planet-stat">
              <span class="planet-stat-label">Diameter</span>
              <span class="planet-stat-value">{{ info.diameter }}</span>
            </div>
            <div class="planet-info-fact">{{ info.fact }}</div>
          }
        }
      </div>

      <!-- ── VIZ SETTINGS ─────────────────────────────────────── -->
      <div class="controls retro-box" role="group" aria-label="Visualization settings">
        <div class="control-header">VIZ SETTINGS</div>
        <div class="button-group" role="group" aria-label="Scale mode">
          <button
            id="scale-accurate-btn"
            [class.active]="scaleMode() === 'accurate'"
            (click)="setScaleMode('accurate')"
            [attr.aria-pressed]="scaleMode() === 'accurate'">
            ACCURATE
          </button>
          <button
            id="scale-log-btn"
            [class.active]="scaleMode() === 'logarithmic'"
            (click)="setScaleMode('logarithmic')"
            [attr.aria-pressed]="scaleMode() === 'logarithmic'">
            LOG SCALE
          </button>
        </div>

        <div class="effects-toggle">
          <label class="toggle-row" for="orbits-toggle-input">
            <span class="toggle-label">SHOW ORBITS</span>
            <input
              type="checkbox"
              id="orbits-toggle-input"
              class="toggle-input"
              [checked]="showOrbits()"
              (change)="onToggleOrbits($event)">
            <div class="toggle-switch" aria-hidden="true"></div>
          </label>
          <label class="toggle-row" for="stars-toggle-input">
            <span class="toggle-label">SHOW STARS</span>
            <input
              type="checkbox"
              id="stars-toggle-input"
              class="toggle-input"
              [checked]="showStars()"
              (change)="onToggleStars($event)">
            <div class="toggle-switch" aria-hidden="true"></div>
          </label>
          <label class="toggle-row" for="ambient-toggle-input">
            <span class="toggle-label">AMBIENT AUDIO</span>
            <input
              type="checkbox"
              id="ambient-toggle-input"
              class="toggle-input"
              [checked]="audio.ambientEnabled()"
              (change)="onToggleAmbient()">
            <div class="toggle-switch" aria-hidden="true"></div>
          </label>
        </div>
      </div>

      <!-- ── TIME CONTROL ──────────────────────────────────────── -->
      <div class="time-control retro-box" role="group" aria-label="Time navigation">
        <div class="time-header">TEMPORAL NAVIGATION</div>
        <div class="time-speed-row">
          <span class="speed-label">SPEED:</span>
          <div class="speed-selector" role="group" aria-label="Time speed">
            @for (mode of speedModes; track mode) {
              <button
                class="speed-btn"
                [id]="'speed-' + mode"
                [class.active]="speedMode() === mode"
                [attr.aria-pressed]="speedMode() === mode"
                (click)="setSpeedMode(mode)">
                {{ speedLabels[mode] }}
              </button>
            }
          </div>
        </div>
        <!-- Scrubber -->
        <div
          class="scrubber-track"
          id="time-scrubber"
          role="slider"
          aria-label="Date scrubber"
          [attr.aria-valuenow]="scrubberPosition()"
          aria-valuemin="0"
          aria-valuemax="100"
          (mousedown)="onScrubStart($event)"
          (touchstart)="onScrubTouchStart($event)"
          (keydown)="onScrubKeydown($event)"
          tabindex="0">
          <div class="scrubber-fill" [style.width.%]="scrubberPosition()"></div>
          <div class="scrubber-thumb" [style.left.%]="scrubberPosition()"></div>
        </div>
        <div class="scrubber-date">{{ currentDate() | date:'dd MMM yyyy' }}</div>
      </div>

      <!-- ── SCALE INDICATOR ──────────────────────────────────── -->
      <div class="scale-indicator retro-box" aria-label="Scale reference">
        <div class="scale-line"></div>
        <div class="scale-text">{{ scaleLabel() }}</div>
      </div>
    </div>

    <!-- ── ERROR OVERLAY ─────────────────────────────────────── -->
    @if (webGLError()) {
      <div class="error-overlay" role="alert">
        <div class="retro-box error-box">
          <h1 class="error-title">CRITICAL ERROR</h1>
          <div class="error-divider"></div>
          <p>GRAPHICS SUBSYSTEM FAILURE</p>
          <p class="error-detail">WebGL Hardware Acceleration is disabled or unavailable.</p>
          <p class="error-suggestion">» PLEASE ENABLE WEBGL IN BROWSER SETTINGS</p>
        </div>
      </div>
    }

    <canvas #canvas tabindex="-1" aria-label="Solar system 3D visualization"></canvas>
  `,
  styleUrl: './solar-system.css',
})
export class SolarSystem implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  // ─── Services ─────────────────────────────────────────────────────────────
  private readonly celestials = inject(CelestialMathService);
  readonly audio = inject(AudioService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly platformId = inject(PLATFORM_ID);

  // ─── Signals (reactive state) ─────────────────────────────────────────────
  readonly planetList     = signal<OrbitalElements[]>([]);
  readonly currentDate    = signal<Date>(new Date());
  readonly scaleMode      = signal<'accurate' | 'logarithmic'>('logarithmic');
  readonly focusedPlanet  = signal<string | null>(null);
  readonly scaleLabel     = signal<string>('--');
  readonly webGLError     = signal<boolean>(false);
  readonly showStars      = signal<boolean>(true);
  readonly showOrbits     = signal<boolean>(true);
  readonly speedMode      = signal<SpeedMode>('realtime');
  readonly scrubberPosition = signal<number>(50); // 0–100 representing a ±2 year window from now

  readonly focusedPlanetInfo = computed(() => {
    const name = this.focusedPlanet();
    return name ? PLANET_INFO[name] ?? null : null;
  });

  // Speed mode meta
  readonly speedModes: SpeedMode[] = ['realtime', '1day', '1month'];
  readonly speedLabels = SPEED_LABELS;

  // ─── Three.js internals ───────────────────────────────────────────────────
  private textureLoader = new THREE.TextureLoader();
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationId: number = 0;
  private planetMeshes: Map<string, THREE.Mesh> = new Map();
  private planetData: Map<string, {
    mesh: THREE.Mesh;
    orbitLine?: THREE.Line;
    orbitalElements: OrbitalElements;
  }> = new Map();
  private orbitLines: THREE.Line[] = [];
  private starsMesh: THREE.Points | null = null;
  private sunGlowSprite: THREE.Sprite | null = null;

  // Camera smoothing
  private targetCameraPos  = new THREE.Vector3(0, 40, 40);
  private targetLookAt     = new THREE.Vector3(0, 0, 0);
  private currentLookAt    = new THREE.Vector3(0, 0, 0);
  private previousFrameTime: number = 0;

  // Time simulation
  private simulationDate: Date = new Date();
  private readonly SCRUBBER_RANGE_DAYS = 365 * 2; // ±2 years around "now"
  private scrubberBaseDate: Date = new Date(); // Reference "now" for scrubber

  // Scrubber drag state
  private isScrubbing = false;
  private lastScrubX = 0;
  private scrubVelocity = 0;
  private lastScrubTickTime = 0;

  private readonly AU_SCALE = 25;

  // Reduced motion preference
  private prefersReducedMotion = false;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    this.planetList.set(this.celestials.getPlanets());
    this.initThree();

    if (!this.webGLError()) {
      this.createPlanets();
      this.updatePlanetScales();
      // Run animation loop OUTSIDE Angular zone to avoid triggering change detection every frame
      this.zone.runOutsideAngular(() => this.animate(performance.now()));
    }

    this.setupGlobalScrubListeners();
    this.setupKeyboardNav();
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.removeGlobalScrubListeners();
    if (this.renderer) this.renderer.dispose();
  }

  // ─── Three.js Init ────────────────────────────────────────────────────────

  private initThree(): void {
    const width  = window.innerWidth;
    const height = window.innerHeight;

    try {
      // ── Premium renderer config ──
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        antialias: true,                    // Smooth edges
        powerPreference: 'high-performance',
        alpha: false,
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for perf
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping      = THREE.LinearToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

      // ── Scene ──
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x07050a);

      // ── Camera ──
      this.camera = new THREE.PerspectiveCamera(55, width / height, 0.05, 6000);
      this.camera.position.copy(this.targetCameraPos);
      this.camera.lookAt(this.targetLookAt);

      // ── Lighting rig ──
      // Neutral white ambient at 1.5 — ensures planet textures render at their
      // true colors (Earth = blue, Mars = red, Jupiter = tan bands, etc.)
      // without being darkened or desaturated by the PBR pipeline
      const ambient = new THREE.AmbientLight(0xffffff, 1.5);
      this.scene.add(ambient);

      // Solar point light — decay=0 (no distance falloff), pure white
      // Adds a directional sun-facing bright side without washing dark side
      const sunLight = new THREE.PointLight(0xfff5e0, 1.8, 0, 0);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width  = 512;
      sunLight.shadow.mapSize.height = 512;
      sunLight.shadow.camera.near = 0.1;
      sunLight.shadow.camera.far  = 2000;
      this.scene.add(sunLight);

      // ── Stars: always on, premium depth ──
      this.createStars();

    } catch (e) {
      console.error('WebGL Initialization Error:', e);
      this.webGLError.set(true);
      this.zone.run(() => this.cdr.markForCheck());
    }
  }

  // ─── Planet Creation ──────────────────────────────────────────────────────

  private createPlanets(): void {
    this.celestials.getPlanets().forEach(p => {
      let geometry: THREE.BufferGeometry;
      let material: THREE.Material;

      if (p.name === 'Sun') {
        geometry = new THREE.SphereGeometry(2, 64, 64);
        const tex = this.textureLoader.load('assets/textures/sun.png');
        material = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0xffffff,
          emissive: new THREE.Color(0xffcc66),
          emissiveIntensity: 0.55,
          roughness: 1.0,
          metalness: 0.0,
        });

        // Sun atmospheric glow sprite
        this.sunGlowSprite = this.createGlowSprite(5.5, '#ffcc44');
        this.scene.add(this.sunGlowSprite);
      } else {
        geometry = new THREE.SphereGeometry(0.5 * p.size, 64, 64);

        const texPaths: Record<string, string> = {
          Mercury: 'assets/textures/mercury.png',
          Venus:   'assets/textures/venus.png',
          Earth:   'assets/textures/earth.png',
          Mars:    'assets/textures/mars.png',
          Jupiter: 'assets/textures/jupiter.png',
          Saturn:  'assets/textures/saturn.png',
          Uranus:  'assets/textures/uranus.png',
          Neptune: 'assets/textures/neptune.png',
        };

        const tex = texPaths[p.name] ? this.textureLoader.load(texPaths[p.name]) : null;
        material = new THREE.MeshStandardMaterial({
          map:       tex ?? undefined,
          color:     tex ? 0xffffff : p.color,
          roughness: 1.0,   // Fully diffuse — no specular tinting, texture color shows true
          metalness: 0.0,   // Non-metallic — planets are rock/gas, not metal
        });
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      let orbitLine: THREE.Line | undefined;
      if (p.name !== 'Sun') {
        const lineGeo = new THREE.BufferGeometry();
        const lineMat = new THREE.LineBasicMaterial({ color: 0x4a3820, opacity: 0.35, transparent: true });
        orbitLine = new THREE.LineLoop(lineGeo, lineMat);
        orbitLine.visible = this.showOrbits();
        this.scene.add(orbitLine);
        this.orbitLines.push(orbitLine);
        this.updateOrbitGeometry(p, orbitLine);
      }

      this.planetData.set(p.name, { mesh, orbitLine, orbitalElements: p });
      this.planetMeshes.set(p.name, mesh);

      // Saturn rings
      if (p.name === 'Saturn') {
        const ringGeo = new THREE.RingGeometry(0.5 * p.size * 1.2, 0.5 * p.size * 2.2, 64);
        const ringTex = this.textureLoader.load('assets/textures/rings.png');
        ringTex.rotation = -Math.PI / 2;
        ringTex.center.set(0.5, 0.5);
        const ringMat = new THREE.MeshStandardMaterial({
          map: ringTex,
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
          roughness: 0.9,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2 - 0.4;
        ringMesh.rotation.y = 0.2;
        mesh.add(ringMesh);
      }
    });

    this.updatePositions();
  }

  /** Create a soft radial glow sprite using canvas texture */
  private createGlowSprite(size: number, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0,   color + 'cc');
    gradient.addColorStop(0.3, color + '55');
    gradient.addColorStop(0.7, color + '18');
    gradient.addColorStop(1,   color + '00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(size);
    return sprite;
  }

  // ─── Public Actions ───────────────────────────────────────────────────────

  setScaleMode(mode: 'accurate' | 'logarithmic'): void {
    this.audio.playClick();
    this.scaleMode.set(mode);
    this.updatePlanetScales();
    this.planetData.forEach(data => {
      if (data.orbitLine) this.updateOrbitGeometry(data.orbitalElements, data.orbitLine);
    });
    this.updatePositions();
  }

  focusPlanet(name: string): void {
    if (this.focusedPlanet() === name) return;
    this.audio.playSelect();
    this.audio.playPanelOpen();
    this.focusedPlanet.set(name);
    this.updateFocusEmphasis();
    this.zone.run(() => this.cdr.markForCheck());
  }

  resetView(): void {
    this.audio.playReset();
    this.focusedPlanet.set(null);
    this.targetCameraPos.set(0, 60, 60);
    this.targetLookAt.set(0, 0, 0);
    this.clearFocusEmphasis();
    this.zone.run(() => this.cdr.markForCheck());
  }

  onToggleMute(): void {
    this.audio.toggleMute();
    this.zone.run(() => this.cdr.markForCheck());
  }

  onToggleAmbient(): void {
    this.audio.toggleAmbient();
    this.zone.run(() => this.cdr.markForCheck());
  }

  onToggleStars(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.audio.playToggle(checked);
    this.showStars.set(checked);
    if (this.starsMesh) this.starsMesh.visible = checked;
  }

  onToggleOrbits(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.audio.playToggle(checked);
    this.showOrbits.set(checked);
    this.orbitLines.forEach(l => l.visible = checked);
  }

  setSpeedMode(mode: SpeedMode): void {
    this.audio.playClick();
    this.speedMode.set(mode);
    this.zone.run(() => this.cdr.markForCheck());
  }

  // ─── Planet Emphasis (Focus Mode) ────────────────────────────────────────

  private updateFocusEmphasis(): void {
    if (this.prefersReducedMotion) return;
    const focused = this.focusedPlanet();
    this.planetData.forEach((data, name) => {
      const mat = data.mesh.material as THREE.MeshStandardMaterial;
      if (!mat.transparent) mat.transparent = true;

      if (name === focused) {
        // Highlight
        mat.opacity = 1.0;
        mat.emissiveIntensity = name === 'Sun' ? 0.55 : 0.12;
        if (data.orbitLine) {
          (data.orbitLine.material as THREE.LineBasicMaterial).color.setHex(0xc8913a);
          (data.orbitLine.material as THREE.LineBasicMaterial).opacity = 0.85;
        }
      } else {
        // De-emphasize
        mat.opacity = 0.38;
        mat.emissiveIntensity = 0;
        if (data.orbitLine) {
          (data.orbitLine.material as THREE.LineBasicMaterial).color.setHex(0x2a1a08);
          (data.orbitLine.material as THREE.LineBasicMaterial).opacity = 0.12;
        }
      }
    });
  }

  private clearFocusEmphasis(): void {
    this.planetData.forEach((data) => {
      const mat = data.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1.0;
      mat.transparent = false;
      mat.emissiveIntensity = data.orbitalElements.name === 'Sun' ? 0.55 : 0;
      if (data.orbitLine) {
        (data.orbitLine.material as THREE.LineBasicMaterial).color.setHex(0x4a3820);
        (data.orbitLine.material as THREE.LineBasicMaterial).opacity = 0.35;
      }
    });
  }

  // ─── Stars ───────────────────────────────────────────────────────────────

  private createStars(): void {
    const starGeo  = new THREE.BufferGeometry();
    const count    = 5000;
    const pos      = new Float32Array(count * 3);
    const sizes    = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute on sphere surface
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 800 + Math.random() * 400;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sizes[i]       = Math.random() < 0.05 ? 2.0 : Math.random() < 0.2 ? 1.2 : 0.7;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe8dcc8,
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
    });

    this.starsMesh = new THREE.Points(starGeo, starMat);
    this.starsMesh.visible = this.showStars();
    this.scene.add(this.starsMesh);
  }

  // ─── Orbit Geometry ───────────────────────────────────────────────────────

  private updateOrbitGeometry(p: OrbitalElements, line: THREE.Line): void {
    const points: THREE.Vector3[] = [];
    const period   = 365.25 * Math.pow(p.a, 1.5);
    const steps    = 180;
    const stepSize = period / steps;
    const startDate = new Date('2000-01-01T12:00:00Z');

    for (let i = 0; i <= steps; i++) {
      const date   = new Date(startDate.getTime() + i * stepSize * 86400000);
      const rawPos = this.celestials.calculatePosition(p.name, date);
      const distAU = rawPos.length();
      const visDist = this.getVisualDistance(distAU);
      points.push(distAU > 0 ? rawPos.normalize().multiplyScalar(visDist) : new THREE.Vector3());
    }
    line.geometry.setFromPoints(points);
  }

  // ─── Scale ────────────────────────────────────────────────────────────────

  private updatePlanetScales(): void {
    const planets = this.celestials.getPlanets();
    const sun = planets.find(p => p.name === 'Sun');
    if (!sun) return;

    planets.forEach(p => {
      const mesh = this.planetMeshes.get(p.name);
      if (!mesh) return;

      let s = 1;
      if (p.name !== 'Sun') {
        if (this.scaleMode() === 'accurate') {
          s = (p.radius / sun.radius) * 2 / (0.5 * p.size);
        } else {
          const val    = Math.log10(p.radius * 10);
          const sunVal = Math.log10(sun.radius * 10);
          s = ((val / sunVal) * 2) / (0.5 * p.size);
        }
      }
      mesh.scale.set(s, s, s);
    });
  }

  // ─── Position Updates ─────────────────────────────────────────────────────

  private updatePositions(): void {
    this.planetData.forEach((data, name) => {
      if (name === 'Sun') return;
      const p      = data.orbitalElements;
      const rawPos = this.celestials.calculatePosition(p.name, this.simulationDate);
      const distAU = rawPos.length();
      const visDist = this.getVisualDistance(distAU);

      if (distAU > 0) {
        data.mesh.position.copy(rawPos).normalize().multiplyScalar(visDist);
      } else {
        data.mesh.position.set(0, 0, 0);
      }
      data.mesh.rotation.y += 0.005;
    });
  }

  private getVisualDistance(au: number): number {
    if (this.scaleMode() === 'accurate') {
      return au * this.AU_SCALE;
    }
    return 3 + Math.log(au + 1) * 8;
  }

  // ─── Scale Indicator ──────────────────────────────────────────────────────

  private updateScaleIndicator(): void {
    const dist = this.camera.position.distanceTo(this.currentLookAt);
    const fov  = this.camera.fov * (Math.PI / 180);
    const visH = 2 * Math.tan(fov / 2) * dist;
    const canH = this.canvasRef.nativeElement.height / window.devicePixelRatio;
    const unitsPer100 = 100 * (visH / canH);
    const auPer100    = unitsPer100 / this.AU_SCALE;

    let label: string;
    if (auPer100 < 0.1) {
      const km = Math.round(auPer100 * 149597870);
      label = `~${(km / 1000).toFixed(0)}k km`;
    } else {
      label = `~${auPer100.toFixed(2)} AU`;
    }
    this.scaleLabel.set(`100px = ${label}`);
  }

  // ─── Simulation Time ──────────────────────────────────────────────────────

  private advanceSimulationTime(deltaMs: number): void {
    if (this.isScrubbing) return; // Scrubbing overrides autonomous time

    const daysPerMs = SPEED_DAYS_PER_MS[this.speedMode()];
    this.simulationDate = new Date(this.simulationDate.getTime() + deltaMs * daysPerMs * 86400000);

    // Update scrubber position (relative to base ± RANGE)
    const offsetDays = (this.simulationDate.getTime() - this.scrubberBaseDate.getTime()) / 86400000;
    const pos = ((offsetDays / this.SCRUBBER_RANGE_DAYS) + 0.5) * 100;
    this.scrubberPosition.set(Math.max(0, Math.min(100, pos)));

    // Update signal every ~500ms to avoid too-frequent re-renders
    this.currentDate.set(new Date(this.simulationDate));
  }

  // ─── Animation Loop ───────────────────────────────────────────────────────

  private animate(now: number): void {
    this.animationId = requestAnimationFrame(t => this.animate(t));

    const deltaMs = Math.min(now - (this.previousFrameTime || now), 50); // cap at 50ms
    this.previousFrameTime = now;

    // Advance time
    this.advanceSimulationTime(deltaMs);
    this.updatePositions();

    // ── Camera: Frame-rate-independent lerp ──
    // lerpFactor chosen so it feels the same at 60 and 120 fps
    const lerpFactor = this.prefersReducedMotion ? 1 : (1 - Math.pow(0.003, deltaMs / 1000));

    if (this.focusedPlanet()) {
      const mesh = this.planetMeshes.get(this.focusedPlanet()!);
      if (mesh) {
        const scale = mesh.scale.x;
        const geoRadius = 0.5 * (this.planetData.get(this.focusedPlanet()!)?.orbitalElements.size ?? 1);
        const radius = geoRadius * scale;

        let distance = Math.max(radius * 4.5, 0.8);
        if (this.scaleMode() === 'accurate') {
          distance = Math.max(radius * 5.5, 0.15);
        }

        const offset = new THREE.Vector3(distance, distance * 0.6, distance);
        this.targetCameraPos.copy(mesh.position.clone().add(offset));
        this.targetLookAt.copy(mesh.position);
      }
    }

    this.camera.position.lerp(this.targetCameraPos, lerpFactor);
    this.currentLookAt.lerp(this.targetLookAt, lerpFactor);
    this.camera.lookAt(this.currentLookAt);

    // Rotate Sun
    const sun = this.planetMeshes.get('Sun');
    if (sun) sun.rotation.y += 0.0015;

    // Glow sprite always at origin
    if (this.sunGlowSprite) this.sunGlowSprite.position.set(0, 0, 0);

    // Slowly rotate star field
    if (this.starsMesh) this.starsMesh.rotation.y += 0.000015;

    this.updateScaleIndicator();

    // Push minimal state to Angular zone for template re-renders
    // Only ~4 times/sec to avoid zone overhead
    if (Math.floor(now / 250) !== Math.floor((now - deltaMs) / 250)) {
      this.zone.run(() => this.cdr.markForCheck());
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Time Scrubber ────────────────────────────────────────────────────────

  private onScrubMove = (e: MouseEvent | TouchEvent): void => {
    if (!this.isScrubbing) return;
    const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
    const dx = clientX - this.lastScrubX;
    this.lastScrubX = clientX;
    this.scrubVelocity = dx;

    const track = document.getElementById('time-scrubber')!;
    const rect  = track.getBoundingClientRect();
    const pct   = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    // Map 0–1 → date within ± RANGE_DAYS from base
    const offsetDays = (pct - 0.5) * this.SCRUBBER_RANGE_DAYS;
    this.simulationDate = new Date(this.scrubberBaseDate.getTime() + offsetDays * 86400000);
    this.scrubberPosition.set(pct * 100);
    this.currentDate.set(new Date(this.simulationDate));

    // Throttled audio tick
    const now = performance.now();
    if (now - this.lastScrubTickTime > 50) {
      this.audio.playTimeScrubTick(dx);
      this.lastScrubTickTime = now;
    }

    this.zone.run(() => this.cdr.markForCheck());
  };

  private onScrubEnd = (): void => {
    this.isScrubbing = false;
    // Update scrubber base to current simulation date so subsequent play continues from here
    this.scrubberBaseDate = new Date(this.simulationDate);
    this.scrubberPosition.set(50);
  };

  onScrubStart(e: MouseEvent): void {
    this.isScrubbing = true;
    this.lastScrubX   = e.clientX;
    this.scrubVelocity = 0;
    e.preventDefault();
  }

  onScrubTouchStart(e: TouchEvent): void {
    this.isScrubbing = true;
    this.lastScrubX   = e.touches[0].clientX;
    this.scrubVelocity = 0;
    e.preventDefault();
  }

  onScrubKeydown(e: KeyboardEvent): void {
    const DAYS_PER_KEY = 30;
    let shift = 0;
    if (e.key === 'ArrowLeft')  shift = -DAYS_PER_KEY;
    if (e.key === 'ArrowRight') shift =  DAYS_PER_KEY;
    if (shift === 0) return;

    e.preventDefault();
    this.audio.playTimeScrubTick(shift);
    this.simulationDate = new Date(this.simulationDate.getTime() + shift * 86400000);
    this.currentDate.set(new Date(this.simulationDate));
    this.zone.run(() => this.cdr.markForCheck());
  }

  private setupGlobalScrubListeners(): void {
    window.addEventListener('mousemove', this.onScrubMove);
    window.addEventListener('mouseup',   this.onScrubEnd);
    window.addEventListener('touchmove', this.onScrubMove, { passive: false });
    window.addEventListener('touchend',  this.onScrubEnd);
  }

  private removeGlobalScrubListeners(): void {
    window.removeEventListener('mousemove', this.onScrubMove);
    window.removeEventListener('mouseup',   this.onScrubEnd);
    window.removeEventListener('touchmove', this.onScrubMove);
    window.removeEventListener('touchend',  this.onScrubEnd);
  }

  // ─── Keyboard Navigation ─────────────────────────────────────────────────

  private setupKeyboardNav(): void {
    // Handled via (keydown.enter) and (keydown.space) on list items in template
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.focusedPlanet()) {
      this.resetView();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
