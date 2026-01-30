import { Component, signal } from '@angular/core';
import { SolarSystem } from './solar-system/solar-system';

@Component({
  selector: 'app-root',
  imports: [SolarSystem],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('retro-orrery');
}
