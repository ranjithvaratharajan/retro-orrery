import { Injectable } from '@angular/core';
import * as THREE from 'three';

export interface OrbitalElements {
  name: string;
  a: number; // Semi-major axis (AU)
  e: number; // Eccentricity
  i: number; // Inclination (degrees)
  L: number; // Mean longitude (degrees)
  longPeri: number; // Longitude of perihelion (degrees)
  node: number; // Longitude of ascending node (degrees)
  color: number;
  radius: number; // Relative radius (Earth = 1)
  size: number; // For rendering size
}

@Injectable({
  providedIn: 'root'
})
export class CelestialMathService {

  // J2000 Orbital Elements (approximate)
  private readonly elements: OrbitalElements[] = [
    { name: 'Sun', a: 0, e: 0, i: 0, L: 0, longPeri: 0, node: 0, color: 0xffff00, radius: 109, size: 5 },
    { name: 'Mercury', a: 0.387098, e: 0.205630, i: 7.00487, L: 252.25084, longPeri: 77.45645, node: 48.33167, color: 0x8c7c6e, radius: 0.38, size: 1 },
    { name: 'Venus', a: 0.723332, e: 0.006773, i: 3.39471, L: 181.97973, longPeri: 131.53298, node: 76.68069, color: 0xe3bb76, radius: 0.95, size: 1.5 },
    { name: 'Earth', a: 1.000000, e: 0.016709, i: 0.00005, L: 100.46435, longPeri: 102.94719, node: 0, color: 0x2233ff, radius: 1, size: 1.6 },
    { name: 'Mars', a: 1.523662, e: 0.093412, i: 1.85061, L: -4.55343, longPeri: -23.94363, node: 49.57854, color: 0xff3300, radius: 0.53, size: 1.2 },
    { name: 'Jupiter', a: 5.203363, e: 0.048393, i: 1.30530, L: 34.40438, longPeri: 14.75385, node: 100.55615, color: 0xd8ca9d, radius: 11.2, size: 3.5 },
    { name: 'Saturn', a: 9.537070, e: 0.054151, i: 2.48446, L: 49.94432, longPeri: 92.43194, node: 113.71504, color: 0xf4d03f, radius: 9.45, size: 3 },
    { name: 'Uranus', a: 19.191264, e: 0.047168, i: 0.76986, L: 313.23218, longPeri: 170.96424, node: 74.22988, color: 0x40e0d0, radius: 4.0, size: 2.2 },
    { name: 'Neptune', a: 30.068963, e: 0.008586, i: 1.76917, L: -55.120029, longPeri: 44.97135, node: 131.72169, color: 0x4169e1, radius: 3.88, size: 2.1 },
  ];

  constructor() { }

  getPlanets(): OrbitalElements[] {
    return this.elements;
  }

  calculatePosition(planetName: string, date: Date = new Date()): THREE.Vector3 {
    const planet = this.elements.find(p => p.name === planetName);
    if (!planet || planet.name === 'Sun') return new THREE.Vector3(0, 0, 0);

    const jd = this.getJulianDate(date);
    const T = (jd - 2451545.0) / 36525; // Centuries since J2000

    // Update elements for time T (simplified linear drift if creating a full service, but static J2000 is often 'good enough' for simple vis. 
    // We will use slight adjustments if we want 2026 accuracy).
    // For this retro-orrery, accurate calculation from static elements is usually acceptable, 
    // but we need to calculate Mean Anomaly properly.

    // Mean Anomaly
    // n = 0.9856076686 / (a * sqrt(a)) degrees per day
    const n = 0.9856076686 / (Math.sqrt(Math.pow(planet.a, 3)));
    const d = jd - 2451545.0; // Days since J2000

    // M = L - longPeri + n * d (simplified)
    // Actually L is mean longitude at epoch.
    // L_current = L_epoch + n * d
    // M = L_current - longPeri

    let L_current = planet.L + n * d;
    L_current = this.normalizeAngle(L_current);

    let M = L_current - planet.longPeri;
    M = this.normalizeAngle(M);

    // Eccentric Anomaly (E) - Solve Kepler's Equation M = E - e*sin(E)
    let E = M * (Math.PI / 180); // Initial guess (in radians)
    const e = planet.e;
    const M_rad = M * (Math.PI / 180);

    for (let i = 0; i < 10; i++) {
      E = E - (E - e * Math.sin(E) - M_rad) / (1 - e * Math.cos(E));
    }

    // True Anomaly (v)
    // tan(v/2) = sqrt((1+e)/(1-e)) * tan(E/2)
    const v_rad = 2 * Math.atan(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2));
    const v = v_rad * (180 / Math.PI);

    // Radius (r)
    const r = planet.a * (1 - e * Math.cos(E));

    // Heliocentric coordinates
    // X = r * (cos(N) cos(v+w) - sin(N) sin(v+w) cos(i))
    // Y = r * (sin(N) cos(v+w) + cos(N) sin(v+w) cos(i))
    // Z = r * (sin(v+w) sin(i))

    const N_rad = planet.node * (Math.PI / 180);
    const w_rad = (planet.longPeri - planet.node) * (Math.PI / 180); // argument of periapsis w = longPeri - node
    const i_rad = planet.i * (Math.PI / 180);
    const u_rad = w_rad + v_rad; // u = w + v

    const x = r * (Math.cos(N_rad) * Math.cos(u_rad) - Math.sin(N_rad) * Math.sin(u_rad) * Math.cos(i_rad));
    const y = r * (Math.sin(N_rad) * Math.cos(u_rad) + Math.cos(N_rad) * Math.sin(u_rad) * Math.cos(i_rad));
    const z = r * (Math.sin(u_rad) * Math.sin(i_rad));

    return new THREE.Vector3(x, z, -y); // Swap Y and Z for Three.js (Y is up)
  }

  private getJulianDate(date: Date): number {
    return (date.getTime() / 86400000) - (date.getTimezoneOffset() / 1440) + 2440587.5;
  }

  private normalizeAngle(angle: number): number {
    let newAngle = angle % 360;
    if (newAngle < 0) newAngle += 360;
    return newAngle;
  }
}
