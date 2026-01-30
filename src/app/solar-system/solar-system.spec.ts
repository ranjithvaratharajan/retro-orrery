import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolarSystem } from './solar-system';

describe('SolarSystem', () => {
  let component: SolarSystem;
  let fixture: ComponentFixture<SolarSystem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolarSystem]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolarSystem);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
