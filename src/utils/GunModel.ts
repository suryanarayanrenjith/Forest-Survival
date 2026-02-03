import * as THREE from 'three';

export class GunModel {
  group: THREE.Group;
  recoilAnimation: number = 0;
  reloadAnimation: number = 0;
  idleSwayTime: number = 0;
  walkBobTime: number = 0;
  isReloading: boolean = false;
  magazine: THREE.Mesh | null = null;
  currentWeaponType: string = 'pistol';
  slide: THREE.Mesh | null = null;
  bolt: THREE.Mesh | null = null;
  ejectedMag: THREE.Mesh | null = null;

  // Base position/rotation (set once, never changes during gameplay)
  private basePosition = { x: 0.3, y: -0.3, z: -0.5 };

  // Animation offsets (accumulated and applied each frame)
  private recoilOffset = { z: 0, rotX: 0 };
  private swayOffset = { rotX: 0, rotY: 0 };
  private walkOffset = { x: 0, y: 0, rotZ: 0 };
  private reloadRotZ: number = 0;

  constructor(type: 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher') {
    this.group = new THREE.Group();
    this.currentWeaponType = type;
    this.createGunModel(type);
  }

  private createGunModel(type: 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher') {
    this.group.clear();

    switch(type) {
      case 'pistol':
        this.createPistol();
        break;
      case 'rifle':
        this.createRifle();
        break;
      case 'shotgun':
        this.createShotgun();
        break;
      case 'smg':
        this.createSMG();
        break;
      case 'sniper':
        this.createSniper();
        break;
      case 'minigun':
        this.createMinigun();
        break;
      case 'launcher':
        this.createLauncher();
        break;
    }

    // Position gun in front of camera
    this.group.position.set(0.3, -0.3, -0.5);
    this.group.scale.set(0.15, 0.15, 0.15);
  }

  private createPistol() {
    // Create high-quality materials with textures
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.95,
      roughness: 0.15,
      envMapIntensity: 1.5,
      flatShading: false
    });

    const gunmetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.9,
      roughness: 0.25,
      envMapIntensity: 1.2
    });

    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.3,
      roughness: 0.85,
      envMapIntensity: 0.5
    });

    // Slide (top part) - more detailed with chamfered edges
    const slideGeometry = new THREE.BoxGeometry(1, 0.7, 4.5);
    this.slide = new THREE.Mesh(slideGeometry, gunmetalMaterial);
    this.slide.position.set(0, 0.8, -1.5);
    this.slide.castShadow = true;
    this.slide.receiveShadow = true;
    this.group.add(this.slide);

    // Slide serrations with better detail
    for (let i = 0; i < 12; i++) {
      const serrGeometry = new THREE.BoxGeometry(0.15, 0.12, 0.2);
      const serr = new THREE.Mesh(serrGeometry, metalMaterial);
      serr.position.set(0, 1.25, -0.3 - i * 0.3);
      serr.castShadow = true;
      this.group.add(serr);
    }

    // Side slide cuts for detail
    const sideCutGeometry = new THREE.BoxGeometry(0.05, 0.3, 2);
    const leftCut = new THREE.Mesh(sideCutGeometry, metalMaterial);
    leftCut.position.set(-0.53, 0.9, -2);
    this.group.add(leftCut);

    const rightCut = new THREE.Mesh(sideCutGeometry, metalMaterial);
    rightCut.position.set(0.53, 0.9, -2);
    this.group.add(rightCut);

    // Barrel extending from slide - more realistic with rifling hint
    const barrelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.5, 16);
    const barrel = new THREE.Mesh(barrelGeometry, metalMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.8, -4.5);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    this.group.add(barrel);

    // Barrel rifling grooves
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const grooveGeometry = new THREE.BoxGeometry(0.02, 1.5, 0.02);
      const groove = new THREE.Mesh(grooveGeometry, new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 1.0,
        roughness: 0.3
      }));
      groove.position.set(Math.cos(angle) * 0.3, 0.8, -4.5);
      groove.rotation.x = Math.PI / 2;
      this.group.add(groove);
    }

    // Muzzle opening with crown
    const muzzleGeometry = new THREE.CylinderGeometry(0.35, 0.3, 0.3, 16);
    const muzzle = new THREE.Mesh(muzzleGeometry, metalMaterial);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.8, -5.3);
    muzzle.castShadow = true;
    this.group.add(muzzle);

    // Muzzle crown (inner detail)
    const crownGeometry = new THREE.CylinderGeometry(0.25, 0.28, 0.15, 16);
    const crown = new THREE.Mesh(crownGeometry, new THREE.MeshStandardMaterial({
      color: 0x000000,
      metalness: 0.95,
      roughness: 0.05
    }));
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 0.8, -5.35);
    this.group.add(crown);

    // Frame/Grip - improved shape
    const gripGeometry = new THREE.BoxGeometry(1.1, 2.4, 1.3);
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.set(0, -0.5, 0.3);
    grip.castShadow = true;
    grip.receiveShadow = true;
    this.group.add(grip);

    // Grip texture - checkered pattern
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 8; j++) {
        const checkSize = 0.15;
        if ((i + j) % 2 === 0) {
          const checkGeometry = new THREE.BoxGeometry(checkSize, checkSize, 0.05);
          const check = new THREE.Mesh(checkGeometry, new THREE.MeshStandardMaterial({
            color: 0x050505,
            metalness: 0.2,
            roughness: 0.95
          }));
          check.position.set(-0.3 + j * checkSize, -0.8 - i * 0.25, 0.68);
          this.group.add(check);
        }
      }
    }

    // Magazine - more realistic
    const magGeometry = new THREE.BoxGeometry(0.8, 2, 0.9);
    const magMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.6,
      roughness: 0.4
    });
    this.magazine = new THREE.Mesh(magGeometry, magMaterial);
    this.magazine.position.set(0, -1, 0.3);
    this.magazine.castShadow = true;
    this.group.add(this.magazine);

    // Trigger guard
    const guardGeometry = new THREE.TorusGeometry(0.5, 0.08, 6, 8, Math.PI);
    const guardMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.3
    });
    const guard = new THREE.Mesh(guardGeometry, guardMaterial);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(0, -0.3, -0.3);
    this.group.add(guard);

    // Trigger
    const triggerGeometry = new THREE.BoxGeometry(0.2, 0.6, 0.15);
    const triggerMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.9,
      roughness: 0.2
    });
    const trigger = new THREE.Mesh(triggerGeometry, triggerMaterial);
    trigger.position.set(0, -0.4, -0.5);
    this.group.add(trigger);

    // Front sight
    const frontSightGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    const sightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4444,
      emissive: 0xff0000,
      emissiveIntensity: 0.6
    });
    const frontSight = new THREE.Mesh(frontSightGeometry, sightMaterial);
    frontSight.position.set(0, 1.3, -3.5);
    this.group.add(frontSight);

    // Rear sight
    const rearSight = new THREE.Mesh(frontSightGeometry, sightMaterial);
    rearSight.position.set(0, 1.3, -0.5);
    this.group.add(rearSight);
  }

  private createRifle() {
    // Upper receiver - more detailed
    const upperGeometry = new THREE.BoxGeometry(1.3, 0.9, 5.5);
    const upperMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.85,
      roughness: 0.25,
      flatShading: false
    });
    const upper = new THREE.Mesh(upperGeometry, upperMaterial);
    upper.position.set(0, 0.5, -1.5);
    upper.castShadow = true;
    this.group.add(upper);

    // Ejection port
    const portGeometry = new THREE.BoxGeometry(0.5, 0.3, 1);
    const port = new THREE.Mesh(portGeometry, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.9, roughness: 0.1 }));
    port.position.set(0.7, 0.6, -0.5);
    this.group.add(port);

    // Charging handle
    const handleGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.8);
    const handle = new THREE.Mesh(handleGeometry, upperMaterial);
    handle.position.set(0, 1, 0.5);
    this.group.add(handle);

    // Bolt carrier (for animation)
    const boltGeometry = new THREE.BoxGeometry(0.4, 0.4, 1.2);
    this.bolt = new THREE.Mesh(boltGeometry, new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.95,
      roughness: 0.1
    }));
    this.bolt.position.set(0, 0.5, 0.5);
    this.group.add(this.bolt);

    // Barrel - more realistic with segments
    const barrelGeometry = new THREE.CylinderGeometry(0.25, 0.27, 7, 16);
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.95,
      roughness: 0.1
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.3, -5);
    barrel.castShadow = true;
    this.group.add(barrel);

    // Flash hider
    const flashHiderGeometry = new THREE.CylinderGeometry(0.35, 0.3, 0.6, 6);
    const flashHider = new THREE.Mesh(flashHiderGeometry, barrelMaterial);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.3, -8.5);
    this.group.add(flashHider);

    // Handguard
    const handguardGeometry = new THREE.BoxGeometry(1, 0.8, 3.5);
    const handguardMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.4,
      roughness: 0.6,
      flatShading: true
    });
    const handguard = new THREE.Mesh(handguardGeometry, handguardMaterial);
    handguard.position.set(0, 0, -3);
    this.group.add(handguard);

    // Lower receiver
    const lowerGeometry = new THREE.BoxGeometry(1.1, 1.2, 2.5);
    const lowerMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.7,
      roughness: 0.3,
      flatShading: true
    });
    const lower = new THREE.Mesh(lowerGeometry, lowerMaterial);
    lower.position.set(0, -0.3, 0.5);
    this.group.add(lower);

    // Magazine
    const magGeometry = new THREE.BoxGeometry(0.7, 2, 0.9);
    const magMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      metalness: 0.3,
      roughness: 0.5,
      flatShading: true,
      emissive: 0x662200,
      emissiveIntensity: 0.2
    });
    this.magazine = new THREE.Mesh(magGeometry, magMaterial);
    this.magazine.position.set(0, -1.8, 0.5);
    this.group.add(this.magazine);

    // Stock
    const stockGeometry = new THREE.BoxGeometry(1, 1.2, 2.5);
    const stockMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      metalness: 0.2,
      roughness: 0.8,
      flatShading: true
    });
    const stock = new THREE.Mesh(stockGeometry, stockMaterial);
    stock.position.set(0, 0.2, 3);
    this.group.add(stock);

    // Optic rail
    const railGeometry = new THREE.BoxGeometry(0.4, 0.3, 3);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.3
    });
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, 1.2, -1);
    this.group.add(rail);

    // Red dot sight
    const sightGeometry = new THREE.BoxGeometry(0.6, 0.6, 1);
    const sightMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.7,
      roughness: 0.3
    });
    const sight = new THREE.Mesh(sightGeometry, sightMaterial);
    sight.position.set(0, 1.6, -1);
    this.group.add(sight);

    // Red dot
    const dotGeometry = new THREE.CircleGeometry(0.08);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(0, 1.6, -1.6);
    this.group.add(dot);
  }

  private createShotgun() {
    // Wide barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.4, 0.35, 5, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.8,
      roughness: 0.3
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -2.5;
    this.group.add(barrel);

    // Pump action
    const pumpGeometry = new THREE.CylinderGeometry(0.45, 0.45, 1, 8);
    const pumpMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a2a1a,
      metalness: 0.3,
      roughness: 0.7
    });
    const pump = new THREE.Mesh(pumpGeometry, pumpMaterial);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.5, -1);
    this.group.add(pump);

    // Body
    const bodyGeometry = new THREE.BoxGeometry(1.8, 2, 2.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.6,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0, 0.5);
    this.group.add(body);

    // Stock
    const stockGeometry = new THREE.BoxGeometry(1.5, 2, 3);
    const stockMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3a2a,
      metalness: 0.2,
      roughness: 0.8
    });
    const stock = new THREE.Mesh(stockGeometry, stockMaterial);
    stock.position.set(0, 0, 3);
    this.group.add(stock);

    // Iron sights
    const sightGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const sightMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      metalness: 0.8,
      roughness: 0.2
    });
    const frontSight = new THREE.Mesh(sightGeometry, sightMaterial);
    frontSight.position.set(0, 1.3, -4);
    this.group.add(frontSight);

    const rearSight = new THREE.Mesh(sightGeometry, sightMaterial);
    rearSight.position.set(0, 1.3, 0);
    this.group.add(rearSight);
  }

  private createSMG() {
    // Compact body
    const bodyGeometry = new THREE.BoxGeometry(1.2, 1.8, 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2a,
      metalness: 0.7,
      roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.group.add(body);

    // Short barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3.5, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.9,
      roughness: 0.1
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.75;
    this.group.add(barrel);

    // Magazine
    const magGeometry = new THREE.BoxGeometry(0.6, 2, 0.8);
    const magMaterial = new THREE.MeshStandardMaterial({
      color: 0x00cccc,
      metalness: 0.6,
      roughness: 0.3
    });
    const mag = new THREE.Mesh(magGeometry, magMaterial);
    mag.position.set(0, -1.5, 0);
    this.group.add(mag);
  }

  private createSniper() {
    // Extra long barrel - high detail
    const barrelGeometry = new THREE.CylinderGeometry(0.25, 0.25, 12, 20);
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.95,
      roughness: 0.05
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -6;
    barrel.castShadow = true;
    this.group.add(barrel);

    // Suppressor/Muzzle brake
    const suppressorGeometry = new THREE.CylinderGeometry(0.4, 0.35, 2, 12);
    const suppressor = new THREE.Mesh(suppressorGeometry, new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.9,
      roughness: 0.2
    }));
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.z = -12.5;
    this.group.add(suppressor);

    // Body/Receiver - military style
    const bodyGeometry = new THREE.BoxGeometry(1.6, 1.2, 4);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a2a1a,
      metalness: 0.6,
      roughness: 0.4
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.set(0, 0, 0);
    body.castShadow = true;
    this.group.add(body);

    // Cheek rest
    const cheekGeometry = new THREE.BoxGeometry(1.4, 0.8, 2.5);
    const cheek = new THREE.Mesh(cheekGeometry, bodyMaterial);
    cheek.position.set(0, 0.5, 2.5);
    this.group.add(cheek);

    // Bipod
    const bipodLegGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2, 8);
    const bipodMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.9,
      roughness: 0.1
    });
    const leftBipod = new THREE.Mesh(bipodLegGeometry, bipodMaterial);
    leftBipod.position.set(-0.8, -1.5, -4);
    leftBipod.rotation.z = 0.3;
    this.group.add(leftBipod);

    const rightBipod = new THREE.Mesh(bipodLegGeometry, bipodMaterial);
    rightBipod.position.set(0.8, -1.5, -4);
    rightBipod.rotation.z = -0.3;
    this.group.add(rightBipod);

    // Large tactical scope - premium look
    const scopeBodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 20);
    const scopeMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.85,
      roughness: 0.2
    });
    const scopeBody = new THREE.Mesh(scopeBodyGeometry, scopeMaterial);
    scopeBody.rotation.z = Math.PI / 2;
    scopeBody.position.set(0, 1.8, -1.5);
    scopeBody.castShadow = true;
    this.group.add(scopeBody);

    // Scope lens (front)
    const lensGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.2, 20);
    const lensMaterial = new THREE.MeshStandardMaterial({
      color: 0x003300,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x00ff00,
      emissiveIntensity: 0.4
    });
    const frontLens = new THREE.Mesh(lensGeometry, lensMaterial);
    frontLens.rotation.z = Math.PI / 2;
    frontLens.position.set(0, 1.8, -3.6);
    this.group.add(frontLens);

    // Scope reticle glow
    const reticleGeometry = new THREE.CircleGeometry(0.05);
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00
    });
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.position.set(0, 1.8, -3.7);
    this.group.add(reticle);

    // Scope mount rings
    const ringGeometry = new THREE.TorusGeometry(0.55, 0.1, 8, 16);
    const ring1 = new THREE.Mesh(ringGeometry, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.3 }));
    ring1.rotation.y = Math.PI / 2;
    ring1.position.set(0, 1.8, -0.5);
    this.group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.8, roughness: 0.3 }));
    ring2.rotation.y = Math.PI / 2;
    ring2.position.set(0, 1.8, -2.5);
    this.group.add(ring2);
  }

  private createMinigun() {
    // Multiple rotating barrels - realistic
    const barrelGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const barrelGeometry = new THREE.CylinderGeometry(0.18, 0.18, 8, 12);
      const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.95,
        roughness: 0.1
      });
      const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.x = Math.cos(angle) * 0.6;
      barrel.position.y = Math.sin(angle) * 0.6;
      barrel.position.z = -4;
      barrel.castShadow = true;
      barrelGroup.add(barrel);

      // Barrel cooling fins
      const finGeometry = new THREE.BoxGeometry(0.05, 0.3, 2);
      const fin = new THREE.Mesh(finGeometry, barrelMaterial);
      fin.position.x = Math.cos(angle) * 0.75;
      fin.position.y = Math.sin(angle) * 0.75;
      fin.position.z = -4;
      barrelGroup.add(fin);
    }
    this.group.add(barrelGroup);

    // Central rotating hub - heavy duty
    const hubGeometry = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 20);
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.9,
      roughness: 0.2
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -4;
    hub.castShadow = true;
    this.group.add(hub);

    // Motor housing
    const motorGeometry = new THREE.CylinderGeometry(0.8, 1, 2.5, 16);
    const motorMaterial = new THREE.MeshStandardMaterial({
      color: 0xff00ff,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xff00ff,
      emissiveIntensity: 0.4
    });
    const motor = new THREE.Mesh(motorGeometry, motorMaterial);
    motor.rotation.x = Math.PI / 2;
    motor.position.z = -1;
    motor.castShadow = true;
    this.group.add(motor);

    // Ammo feed system
    const feedGeometry = new THREE.BoxGeometry(1.2, 1.5, 1.5);
    const feed = new THREE.Mesh(feedGeometry, new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.7,
      roughness: 0.4
    }));
    feed.position.set(0, 0.8, 1);
    this.group.add(feed);

    // Large ammo box
    const boxGeometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
    const boxMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      metalness: 0.6,
      roughness: 0.5
    });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.set(0, -0.5, 2);
    box.castShadow = true;
    this.group.add(box);

    // Ammo belt
    const beltGeometry = new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI);
    const beltMaterial = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      metalness: 0.8,
      roughness: 0.3
    });
    const belt = new THREE.Mesh(beltGeometry, beltMaterial);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 0.5, 0.5);
    this.group.add(belt);

    // Grip handle
    const handleGeometry = new THREE.BoxGeometry(1.2, 2, 1.2);
    const handle = new THREE.Mesh(handleGeometry, new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.4,
      roughness: 0.7
    }));
    handle.position.set(0, -1, 0.5);
    this.group.add(handle);
  }

  private createLauncher() {
    // Large tube
    const tubeGeometry = new THREE.CylinderGeometry(0.6, 0.6, 6, 8);
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a,
      metalness: 0.7,
      roughness: 0.3
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -3;
    this.group.add(tube);

    // Rocket tip (visible)
    const tipGeometry = new THREE.ConeGeometry(0.5, 1.5, 8);
    const tipMaterial = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      metalness: 0.6,
      roughness: 0.2,
      emissive: 0xff2200,
      emissiveIntensity: 0.4
    });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -6.5;
    this.group.add(tip);

    // Grip
    const gripGeometry = new THREE.BoxGeometry(1, 2, 1.5);
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.5,
      roughness: 0.5
    });
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.set(0, -0.5, 0);
    this.group.add(grip);
  }

  /**
   * Update recoil animation - calculates recoil offset
   */
  updateRecoil(delta: number) {
    // Recoil animation - smooth decay
    if (this.recoilAnimation > 0) {
      this.recoilAnimation -= delta * 12; // Faster decay for snappier feel
      this.recoilAnimation = Math.max(0, this.recoilAnimation);

      // Calculate recoil offsets (don't apply directly)
      this.recoilOffset.z = this.recoilAnimation * 0.12;
      this.recoilOffset.rotX = -this.recoilAnimation * 0.25;

      // Slide/bolt blowback animation (these are independent meshes, safe to modify directly)
      if (this.slide && this.currentWeaponType === 'pistol') {
        this.slide.position.z = -1.5 + this.recoilAnimation * 0.8;
      }
      if (this.bolt && (this.currentWeaponType === 'rifle' || this.currentWeaponType === 'sniper')) {
        this.bolt.position.z = 0.5 + this.recoilAnimation * 1.2;
      }
    } else {
      // Smoothly decay offsets to zero
      this.recoilOffset.z *= 0.85;
      this.recoilOffset.rotX *= 0.85;

      // Reset slide/bolt smoothly
      if (this.slide) {
        this.slide.position.z += (-1.5 - this.slide.position.z) * 0.3;
      }
      if (this.bolt) {
        this.bolt.position.z += (0.5 - this.bolt.position.z) * 0.3;
      }
    }

    // Advanced Reload animation
    if (this.isReloading) {
      this.reloadAnimation += delta * 2.5;

      // Stage 1: Magazine eject (0.0 - 0.2)
      if (this.reloadAnimation < 0.2) {
        const progress = this.reloadAnimation / 0.2;
        if (this.magazine) {
          this.magazine.position.y = -1 - progress * 3;
          this.magazine.rotation.x = progress * 1.5;
          this.magazine.rotation.z = progress * 0.5;
        }
        if (this.slide) {
          this.slide.position.z = -1.5 + progress * 0.5;
        }
        this.reloadRotZ = 0;
      }
      // Stage 2: Magazine gone, prepare new (0.2 - 0.4)
      else if (this.reloadAnimation < 0.4) {
        const progress = (this.reloadAnimation - 0.2) / 0.2;
        if (this.magazine) {
          this.magazine.visible = false;
        }
        this.reloadRotZ = progress * 0.3;
      }
      // Stage 3: New magazine insert (0.4 - 0.7)
      else if (this.reloadAnimation < 0.7) {
        const progress = (this.reloadAnimation - 0.4) / 0.3;
        if (this.magazine) {
          this.magazine.visible = true;
          this.magazine.position.y = -4 + progress * 3;
          this.magazine.rotation.x = 0;
          this.magazine.rotation.z = 0;
        }
        this.reloadRotZ = 0.3;
      }
      // Stage 4: Seat magazine and release slide/bolt (0.7 - 1.0)
      else if (this.reloadAnimation < 1.0) {
        const progress = (this.reloadAnimation - 0.7) / 0.3;
        if (this.magazine) {
          this.magazine.position.y = -1;
        }
        if (this.slide) {
          this.slide.position.z = -1.5 + (1 - progress) * 0.5;
        }
        if (this.bolt) {
          this.bolt.position.z = 0.5 + (1 - progress) * 1.2;
        }
        this.reloadRotZ = (1 - progress) * 0.3;
      }
      // Complete
      else {
        this.isReloading = false;
        this.reloadAnimation = 0;
        this.reloadRotZ = 0;
        if (this.magazine) {
          this.magazine.position.y = -1;
          this.magazine.rotation.x = 0;
          this.magazine.rotation.z = 0;
          this.magazine.visible = true;
        }
        if (this.slide) {
          this.slide.position.z = -1.5;
        }
        if (this.bolt) {
          this.bolt.position.z = 0.5;
        }
      }
    } else {
      this.reloadRotZ *= 0.9; // Decay reload rotation when not reloading
    }
  }

  /**
   * Update idle sway - calculates sway offset
   */
  updateIdleSway(delta: number) {
    this.idleSwayTime += delta;

    // Very subtle breathing/idle motion
    this.swayOffset.rotX = Math.sin(this.idleSwayTime * 0.5) * 0.0008;
    this.swayOffset.rotY = Math.cos(this.idleSwayTime * 0.4) * 0.0006;
  }

  /**
   * Update walk bobbing - calculates walk offset
   */
  updateWalkBob(delta: number, isWalking: boolean, isRunning: boolean) {
    if (isWalking) {
      const speed = isRunning ? 5.0 : 3.5;
      const intensity = isRunning ? 0.006 : 0.004;

      this.walkBobTime += delta * speed;

      // Calculate target offsets
      const targetY = Math.sin(this.walkBobTime) * intensity;
      const targetX = Math.sin(this.walkBobTime * 0.5) * intensity * 0.25;
      const targetRotZ = Math.sin(this.walkBobTime * 0.5) * intensity * 0.6;

      // Smooth lerp to target
      this.walkOffset.y += (targetY - this.walkOffset.y) * delta * 8;
      this.walkOffset.x += (targetX - this.walkOffset.x) * delta * 8;
      this.walkOffset.rotZ += (targetRotZ - this.walkOffset.rotZ) * delta * 6;
    } else {
      // Smooth decay to zero
      this.walkOffset.y *= 0.92;
      this.walkOffset.x *= 0.92;
      this.walkOffset.rotZ *= 0.92;
    }
  }

  /**
   * Apply all animation offsets to the gun group - call this AFTER all update methods
   */
  applyAnimations() {
    // Combine base position with all offsets
    this.group.position.x = this.basePosition.x + this.walkOffset.x;
    this.group.position.y = this.basePosition.y + this.walkOffset.y;
    this.group.position.z = this.basePosition.z + this.recoilOffset.z;

    // Combine all rotation offsets
    this.group.rotation.x = this.swayOffset.rotX + this.recoilOffset.rotX;
    this.group.rotation.y = this.swayOffset.rotY;
    this.group.rotation.z = this.walkOffset.rotZ + this.reloadRotZ;
  }

  triggerRecoil() {
    // Cap recoil to prevent stacking when spam clicking
    this.recoilAnimation = Math.min(1.0, this.recoilAnimation + 0.8);
  }

  triggerReload() {
    this.isReloading = true;
    this.reloadAnimation = 0;
  }

  switchWeapon(type: 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher') {
    this.currentWeaponType = type;
    this.createGunModel(type);
  }
}
