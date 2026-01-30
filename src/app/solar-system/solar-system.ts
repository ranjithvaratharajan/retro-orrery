import { Component, ElementRef, OnInit, ViewChild, OnDestroy, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { CelestialMathService, OrbitalElements } from '../services/celestial-math';

@Component({
  selector: 'app-solar-system',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ui-overlay">
        <!-- Header / Stats -->
        <div class="header-panel retro-box">
            <h1 class="title">RETRO ORRERY <span class="blink">v1.0</span></h1>
            <div class="date-display">{{ currentDate | date:'mediumDate' }}</div>
            <div class="scale-mode-display" [class.warning]="scaleMode === 'logarithmic'">
                MODE: {{ scaleMode === 'accurate' ? 'ACCURATE (1:1)' : 'LOGARITHMIC (VISUAL)' }}
            </div>
        </div>

        <!-- Planet Selector -->
        <div class="planet-list retro-box">
            <div class="list-header">TARGET SYSTEM</div>
            <ul>
                <li *ngFor="let p of planetList" 
                    [class.active]="focusedPlanet === p.name"
                    (click)="focusPlanet(p.name)">
                    <span class="planet-icon" [style.backgroundColor]="'#' + p.color.toString(16)"></span>
                    {{ p.name }}
                </li>
            </ul>
            <button class="reset-btn" (click)="resetView()">RESET VIEW</button>
        </div>

        <!-- Scale Controls -->
        <div class="controls retro-box">
            <div class="control-header">VIZ SETTINGS</div>
            <div class="button-group">
                <button [class.active]="scaleMode === 'accurate'" (click)="setScaleMode('accurate')">ACCURATE</button>
                <button [class.active]="scaleMode === 'logarithmic'" (click)="setScaleMode('logarithmic')">LOG SCALE</button>
            </div>
            
            <!-- Toggles -->
             <div class="effects-toggle">
                <label><input type="checkbox" [checked]="showOrbits" (change)="toggleOrbits($event)"> SHOW ORBITS</label>
                <label><input type="checkbox" [checked]="showStars" (change)="toggleStars($event)"> SHOW STARS</label>
             </div>
        </div>
        

        <!-- Dynamic Scale Indicator -->
        <div class="scale-indicator retro-box">
            <div class="scale-line"></div>
            <div class="scale-text">{{ scaleLabel }}</div>
        </div>
    </div>
    
    <div class="error-overlay" *ngIf="webGLError">
        <div class="retro-box error-box">
            <h1 class="blink-red">CRITICAL ERROR</h1>
            <div class="divider"></div>
            <p>GRAPHICS SUBSYSTEM FAILURE</p>
            <p class="detail">WebGL Hardware Acceleration is disabled or unavailable.</p>
            <p class="suggestion">>> PLEASE ENABLE WEBGL IN BROWSER SETTINGS</p>
        </div>
    </div>
    
    <canvas #canvas></canvas>
  `,
  styles: [`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      position: relative;
      font-family: 'Courier New', Courier, monospace; /* Fallback retro font */
      color: #0f0; /* Classic Terminal Green */
    }
    
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Retro UI Styling */
    .ui-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        padding: 20px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }

    /* Glass/Retro Box Style */
    .retro-box {
        background: rgba(0, 20, 0, 0.7);
        border: 2px solid #0f0;
        padding: 10px;
        box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
        pointer-events: auto;
        backdrop-filter: blur(2px);
    }

    /* Header */
    .header-panel {
        align-self: flex-start;
        min-width: 300px;
    }
    .title {
        margin: 0;
        font-size: 1.5rem;
        letter-spacing: 2px;
        text-shadow: 2px 2px #000;
    }
    .blink {
        animation: blink 1s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    
    .date-display {
        margin-top: 5px;
        font-weight: bold;
        color: #fff;
    }
    .scale-mode-display {
        background: #003300;
        color: #0f0;
        padding: 2px 5px;
        margin-top: 5px;
        font-size: 0.8rem;
    }
    .scale-mode-display.warning {
        color: #ffaa00;
        border-color: #ffaa00;
    }

    /* Planet List - Sidebar */
    .planet-list {
        position: absolute;
        right: 20px;
        top: 20px;
        width: 160px;
    }
    .list-header {
        border-bottom: 1px solid #0f0;
        margin-bottom: 5px;
        font-weight: bold;
        text-align: center;
    }
    ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    li {
        padding: 5px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.2s;
    }
    li:hover {
        background: rgba(0, 255, 0, 0.2);
    }
    li.active {
        background: #0f0;
        color: #000;
        font-weight: bold;
    }
    .planet-icon {
        width: 8px;
        height: 8px;
        display: inline-block;
        border-radius: 50%;
    }
    .reset-btn {
        width: 100%;
        margin-top: 10px;
        background: transparent;
        border: 1px solid #0f0;
        color: #0f0;
        padding: 5px;
        cursor: pointer;
        font-family: inherit;
    }
    .reset-btn:hover {
        background: #0f0;
        color: #000;
    }

    /* Bottom Controls */
    .controls {
        position: absolute;
        bottom: 20px;
        right: 20px;
    }
    .button-group {
        display: flex;
        gap: 5px;
    }
    button {
        background: black;
        border: 1px solid #0f0;
        color: #0f0;
        padding: 5px 10px;
        cursor: pointer;
        font-family: inherit;
        text-transform: uppercase;
    }
    button.active {
        background: #0f0;
        color: black;
    }

    /* Scale Indicator */
    .scale-indicator {
        position: absolute;
        top: 140px;
        left: 20px;
        min-width: 200px;
    }
    .scale-line {
        height: 2px;
        width: 100px; /* Reference width: 100px */
        background: #0f0;
        margin-bottom: 5px;
        position: relative;
    }
    .scale-line::before, .scale-line::after {
        content: '';
        position: absolute;
        top: -4px;
        width: 2px;
        height: 10px;
        background: #0f0;
    }
    .scale-line::after { right: 0; }
    
    .scale-line::after { right: 0; }
    
    .effects-toggle {
        margin-top: 10px;
        padding-top: 5px;
        border-top: 1px solid #003300;
        text-align: right;
    }
    .effects-toggle label {
        cursor: pointer;
        font-size: 0.8rem;
        display: block;
        margin-bottom: 5px;
    }

    /* Error Overlay */
    .error-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
    }
    .error-box {
        border-color: #ff0000;
        color: #ff0000;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.4);
        max-width: 500px;
        text-align: center;
    }
    .blink-red {
        animation: blink-red 1s step-end infinite;
        color: #ff0000;
        margin: 0;
    }
    @keyframes blink-red { 50% { opacity: 0.5; } }
    
    .divider {
        height: 1px;
        background: #ff0000;
        margin: 10px 0;
    }
    .detail {
        font-size: 1.2rem;
        margin: 20px 0;
    }
    .suggestion {
        font-size: 0.9rem;
        opacity: 0.8;
    }
  `]
})
export class SolarSystem implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private textureLoader = new THREE.TextureLoader();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationId: number = 0;

  private planetMeshes: Map<string, THREE.Mesh> = new Map();
  private celestials = inject(CelestialMathService);

  // State
  public planetList: OrbitalElements[] = [];
  public currentDate = new Date(); // Start with "now"
  public scaleMode: 'accurate' | 'logarithmic' = 'logarithmic';
  public focusedPlanet: string | null = null;
  public scaleLabel: string = '--';
  public webGLError: boolean = false;
  public showStars: boolean = false;
  public showOrbits: boolean = true;

  private starsMesh: THREE.Points | null = null;
  // Map to store mesh and ring for each planet to update them dynamically
  private planetData: Map<string, { mesh: THREE.Mesh, orbitLine?: THREE.Line, orbitalElements: OrbitalElements }> = new Map();
  private orbitLines: THREE.Line[] = [];

  // Camera Animation
  private targetCameraPos = new THREE.Vector3(0, 40, 40);
  private targetLookAt = new THREE.Vector3(0, 0, 0);
  private currentLookAt = new THREE.Vector3(0, 0, 0);

  ngOnInit(): void {
    this.planetList = this.celestials.getPlanets();
    this.initThree();
    if (!this.webGLError) {
      this.createPlanets();
      this.updatePlanetScales();
      this.animate();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
  }

  private initThree(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    try {
      // Renderer
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvasRef.nativeElement,
        antialias: false,
        powerPreference: "high-performance"
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio); // Maintain density for pixel shader calculation

      // Scene & Camera
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x020205); // Very dark void

      this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
      this.camera.position.copy(this.targetCameraPos);
      this.camera.lookAt(this.targetLookAt);

      // Lights
      const ambient = new THREE.AmbientLight(0xffffff, 0.2);
      this.scene.add(ambient);
      const sunLight = new THREE.PointLight(0xffddaa, 2, 800);
      this.scene.add(sunLight);

      // Stars removed

    } catch (e) {
      console.error('WebGL Initialization Error:', e);
      this.webGLError = true;
    }
  }


  private createPlanets(): void {
    this.celestials.getPlanets().forEach(p => {
      let geometry;
      let material;

      if (p.name === 'Sun') {
        geometry = new THREE.SphereGeometry(2, 64, 64);
        const texture = this.textureLoader.load('assets/textures/sun.png');
        material = new THREE.MeshBasicMaterial({
          map: texture,
          color: 0xffffff // Use white so texture shows true colors
        });
      } else {
        geometry = new THREE.SphereGeometry(0.5 * p.size, 64, 64);

        let texturePath = '';
        switch (p.name) {
          case 'Mercury': texturePath = 'assets/textures/mercury.png'; break;
          case 'Venus': texturePath = 'assets/textures/venus.png'; break;
          case 'Earth': texturePath = 'assets/textures/earth.png'; break;
          case 'Mars': texturePath = 'assets/textures/mars.png'; break;
          case 'Jupiter': texturePath = 'assets/textures/jupiter.png'; break;
          case 'Saturn': texturePath = 'assets/textures/saturn.png'; break;
          case 'Uranus': texturePath = 'assets/textures/uranus.png'; break;
          case 'Neptune': texturePath = 'assets/textures/neptune.png'; break;
        }

        const texture = texturePath ? this.textureLoader.load(texturePath) : null;

        material = new THREE.MeshStandardMaterial({
          map: texture,
          color: texture ? 0xffffff : p.color, // Fallback to color if no texture
          roughness: 0.7,
        });
      }

      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
      // Removed: this.planetMeshes.set(p.name, mesh);

      let orbitLine: THREE.Line | undefined;

      // Add orbit path (LineLoop)
      if (p.name !== 'Sun') {
        const lineGeo = new THREE.BufferGeometry();
        const lineMat = new THREE.LineBasicMaterial({ color: 0x333333, opacity: 0.4, transparent: true });
        orbitLine = new THREE.LineLoop(lineGeo, lineMat);
        orbitLine.visible = this.showOrbits;
        this.scene.add(orbitLine);
        this.orbitLines.push(orbitLine);

        // Initial generation
        this.updateOrbitGeometry(p, orbitLine);
      }

      this.planetData.set(p.name, { mesh, orbitLine, orbitalElements: p });
      this.planetMeshes.set(p.name, mesh); // Keep for compatibility

      // Saturn Rings
      if (p.name === 'Saturn') {
        const saturnRingGeo = new THREE.RingGeometry(0.5 * p.size * 1.2, 0.5 * p.size * 2.2, 64);
        const ringTexture = this.textureLoader.load('assets/textures/rings.png');
        // Rotate texture to align with ring geometry mapping
        ringTexture.rotation = -Math.PI / 2;
        ringTexture.center.set(0.5, 0.5);

        const saturnRingMat = new THREE.MeshStandardMaterial({
          map: ringTexture,
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9
        });
        const saturnRing = new THREE.Mesh(saturnRingGeo, saturnRingMat);
        // Tilt Saturn's rings
        saturnRing.rotation.x = Math.PI / 2 - 0.4;
        saturnRing.rotation.y = 0.2;

        mesh.add(saturnRing); // Add to planet mesh so it moves/scales with it
      }
    });
    this.updatePositions();
  }

  // --- Logic ---

  public setScaleMode(mode: 'accurate' | 'logarithmic'): void {
    this.scaleMode = mode;
    this.updatePlanetScales();
    // Regenerate orbits for new scale
    this.planetData.forEach((data) => {
      if (data.orbitLine) this.updateOrbitGeometry(data.orbitalElements, data.orbitLine);
    });
    // Force position update
    this.updatePositions();
  }

  public focusPlanet(name: string): void {
    const mesh = this.planetMeshes.get(name);
    if (!mesh) return;

    this.focusedPlanet = name;
  }

  public resetView(): void {
    this.focusedPlanet = null;
    this.targetCameraPos.set(0, 60, 60); // Reset to high view
    this.targetLookAt.set(0, 0, 0);
  }


  public toggleStars(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.showStars = checked;

    if (this.showStars) {
      if (!this.starsMesh) {
        this.createStars();
      } else {
        this.starsMesh.visible = true;
      }
    } else {
      if (this.starsMesh) {
        this.starsMesh.visible = false;
      }
    }
  }

  public toggleOrbits(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.showOrbits = checked;
    this.orbitLines.forEach(line => line.visible = this.showOrbits);
  }

  private createStars(): void {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 600; // Spread 600 units
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x888888, size: 0.5 });
    this.starsMesh = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starsMesh);
  }

  private updateOrbitGeometry(p: OrbitalElements, line: THREE.Line): void {
    const points: THREE.Vector3[] = [];
    const period = 365.25 * Math.pow(p.a, 1.5); // Approx period in days
    const steps = 128;
    const stepSize = period / steps;

    // We simulate one full orbit using the calculatePosition logic
    // We can start from a fixed epoch (J2000) for consistency of the static path
    const startDate = new Date('2000-01-01T12:00:00Z');

    for (let i = 0; i <= steps; i++) {
      const date = new Date(startDate.getTime() + i * stepSize * 86400000);
      const rawPos = this.celestials.calculatePosition(p.name, date);

      const distAU = rawPos.length();
      const visualDist = this.getVisualDistance(distAU);

      if (distAU > 0) {
        points.push(rawPos.normalize().multiplyScalar(visualDist));
      } else {
        points.push(new THREE.Vector3(0, 0, 0));
      }
    }

    line.geometry.setFromPoints(points);
  }

  private updatePlanetScales(): void {
    const planets = this.celestials.getPlanets();
    const sun = planets.find(p => p.name === 'Sun');
    if (!sun) return;

    planets.forEach(p => {
      const mesh = this.planetMeshes.get(p.name);
      if (!mesh) return;

      let s = 1;
      if (p.name !== 'Sun') {
        if (this.scaleMode === 'accurate') {
          // 1:1 Relative to Sun (Sun r=2)
          // Scale = (p.radius / sun.radius) * (2 / baseGeoSize)
          // baseGeoSize = 0.5 * p.size
          s = (p.radius / sun.radius) * 2 / (0.5 * p.size);
        } else {
          // Logarithmic
          // Visual size based on log10 of radius
          const val = Math.log10(p.radius * 10);
          const sunVal = Math.log10(sun.radius * 10);
          const target = (val / sunVal) * 2;
          s = target / (0.5 * p.size);
        }
      }
      mesh.scale.set(s, s, s);
    });
  }

  private updatePositions(): void {
    this.planetData.forEach((data, name) => {
      if (name === 'Sun') return;

      const p = data.orbitalElements;
      const rawPos = this.celestials.calculatePosition(p.name, this.currentDate); // Vector3(x, z, -y) in AU

      // Calculate visual distance based on mode
      // Calculate magnitude in AU
      const distAU = rawPos.length();

      const visualDist = this.getVisualDistance(distAU);

      // Normalize and scale
      if (distAU > 0) {
        data.mesh.position.copy(rawPos).normalize().multiplyScalar(visualDist);
      } else {
        data.mesh.position.set(0, 0, 0);
      }

      data.mesh.rotation.y += 0.005;

      // Ring update removed (lines are static per mode)
    });
  }

  private getVisualDistance(au: number): number {
    if (this.scaleMode === 'accurate') {
      return au * 5; // 1 AU = 5 Units
    } else {
      // Logarithmic / Visual
      // Sun Radius is 2. Mercury Radius ~0.6. Total blocking is ~2.6.
      // We need min distance > 2.6.
      // Formula: 3 + Math.log(au + 1) * 8
      // au=0.4 => 3 + 0.33*8 = 5.6 (Safe)
      // au=30 => 3 + 3.4*8 = 30.2
      return 3 + Math.log(au + 1) * 8;
    }
  }

  private updateScaleIndicator(): void {
    // Logic: 100px line = How many km?
    // 1 Unit = 1/5 AU.
    // 1 AU = 149,600,000 km.
    // Distance from camera to target?

    const dist = this.camera.position.distanceTo(this.currentLookAt);
    const fov = this.camera.fov * (Math.PI / 180);
    const visibleHeightAtDist = 2 * Math.tan(fov / 2) * dist;

    // canvas height in px
    const canvasHeight = this.canvasRef.nativeElement.height / window.devicePixelRatio;

    // 1 px = visibleHeightAtDist / canvasHeight (World Units)
    // 100 px = 100 * (visibleHeightAtDist / canvasHeight) (World Units)

    const unitsPer100Px = 100 * (visibleHeightAtDist / canvasHeight);

    // Convert Units to AU (1 AU = 5 Units)
    const auPer100Px = unitsPer100Px / 5;

    let label = "";
    if (auPer100Px < 0.1) {
      // Show KM
      const km = Math.round(auPer100Px * 149597870);
      label = `~${(km / 1000).toFixed(0)}k km`;
    } else {
      // Show AU
      label = `~${auPer100Px.toFixed(2)} AU`;
    }

    this.scaleLabel = `100px = ${label}`;
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    // Update Date & Positions
    this.currentDate = new Date();
    this.updatePositions();

    // Smooth Camera Movement
    if (this.focusedPlanet) {
      const mesh = this.planetMeshes.get(this.focusedPlanet);
      if (mesh) {
        // Target position: Offset from planet
        // Calculate appropriate offset based on scale
        // Get visual scale of planet
        const scale = mesh.scale.x;
        const geoRadius = 0.5 * (this.planetData.get(this.focusedPlanet)?.orbitalElements.size || 1);
        const radius = geoRadius * scale;

        let distance = Math.max(radius * 4, 0.5); // Minimum distance

        // Ensure minimum distance for Accurate mode visibility
        if (this.scaleMode === 'accurate') {
          distance = radius * 5;
          if (distance < 0.1) distance = 0.1; // Cap for tiny planets
        }

        const offset = new THREE.Vector3(distance, distance, distance);

        const targetPos = mesh.position.clone().add(offset);
        this.targetCameraPos.copy(targetPos);
        this.targetLookAt.copy(mesh.position);
      }
    }

    // Lerp Camera
    this.camera.position.lerp(this.targetCameraPos, 0.05);
    this.currentLookAt.lerp(this.targetLookAt, 0.05);
    this.camera.lookAt(this.currentLookAt);

    // Rotate Sun
    const sun = this.planetMeshes.get('Sun');
    if (sun) sun.rotation.y += 0.002;

    this.updateScaleIndicator();

    this.renderer.render(this.scene, this.camera);
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
