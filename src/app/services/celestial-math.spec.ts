import { TestBed } from '@angular/core/testing';

import { CelestialMath } from './celestial-math';

describe('CelestialMath', () => {
  let service: CelestialMath;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CelestialMath);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
