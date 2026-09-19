import * as THREE from './three.module.js';
import {
  heroFaceTexture,
  brianFaceTexture,
  zombieFaceTexture,
  goldTexture,
  swordTexture,
  bandageTexture,
  torchTexture
} from './textures.js';

// Materials
const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xc68642 });
const heroShirtMaterial = new THREE.MeshLambertMaterial({ color: 0x00a8a8 }); // Cyan
const brianShirtMaterial = new THREE.MeshLambertMaterial({ color: 0x1f4037 }); // Dark Cyan
const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x2b3ea0 }); // Blue Jeans
const zombieSkinMaterial = new THREE.MeshLambertMaterial({ color: 0x567d46 }); // Zombie Green
const zombieShirtMaterial = new THREE.MeshLambertMaterial({ color: 0x3d7068 });
const zombiePantsMaterial = new THREE.MeshLambertMaterial({ color: 0x272744 });

// Helper to create a multi-material box with front face texture
function createHead(faceTexture, skinMat) {
  const materials = [
    skinMat, // right
    skinMat, // left
    skinMat, // top
    skinMat, // bottom
    new THREE.MeshLambertMaterial({ map: faceTexture }), // front
    skinMat  // back
  ];
  return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), materials);
}

// 3D Sword Mesh
export function createSwordMesh() {
  const group = new THREE.Group();

  // Blade
  const bladeGeo = new THREE.BoxGeometry(0.08, 0.6, 0.04);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x33e1e6 }); // Diamond cyan
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.35;
  group.add(blade);

  // Crossguard
  const guardGeo = new THREE.BoxGeometry(0.24, 0.06, 0.06);
  const guardMat = new THREE.MeshLambertMaterial({ color: 0x4a2912 });
  const guard = new THREE.Mesh(guardGeo, guardMat);
  guard.position.y = 0.05;
  group.add(guard);

  // Handle
  const handleGeo = new THREE.BoxGeometry(0.06, 0.2, 0.05);
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.position.y = -0.07;
  group.add(handle);

  return group;
}

// Create Player Model
export function createPlayerModel(role = 'Hero') {
  const group = new THREE.Group();
  const isHero = role === 'Hero';
  const faceTex = isHero ? heroFaceTexture : brianFaceTexture;
  const shirtMat = isHero ? heroShirtMaterial : brianShirtMaterial;

  // Head
  const head = createHead(faceTex, skinMaterial);
  head.position.y = 1.5;
  group.add(head);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.25), shirtMat);
  torso.position.y = 0.95;
  group.add(torso);

  // Left Arm (pivot at shoulder)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.38, 1.25, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), skinMaterial);
  leftArmMesh.position.y = -0.3;
  leftArmGroup.add(leftArmMesh);
  group.add(leftArmGroup);

  // Right Arm (pivot at shoulder)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.38, 1.25, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), skinMaterial);
  rightArmMesh.position.y = -0.3;
  rightArmGroup.add(rightArmMesh);

  // Held Sword (hidden by default)
  const sword = createSwordMesh();
  sword.position.set(0, -0.45, 0.2);
  sword.rotation.x = Math.PI / 4;
  sword.visible = false;
  rightArmGroup.add(sword);

  group.add(rightArmGroup);

  // Left Leg (pivot at hip)
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.14, 0.65, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), pantsMaterial);
  leftLegMesh.position.y = -0.32;
  leftLegGroup.add(leftLegMesh);
  group.add(leftLegGroup);

  // Right Leg (pivot at hip)
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.14, 0.65, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), pantsMaterial);
  rightLegMesh.position.y = -0.32;
  rightLegGroup.add(rightLegMesh);
  group.add(rightLegGroup);

  // Floating Name & HP Tag Sprite
  const nameSprite = createNameTagSprite(role, 100);
  nameSprite.position.set(0, 1.95, 0);
  group.add(nameSprite);

  return {
    root: group,
    head,
    torso,
    leftArm: leftArmGroup,
    rightArm: rightArmGroup,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup,
    sword,
    nameSprite,
    updateAnim: (walkSpeed, time) => {
      if (walkSpeed > 0.1) {
        const angle = Math.sin(time * 8) * 0.55;
        leftArmGroup.rotation.x = angle;
        rightArmGroup.rotation.x = -angle;
        leftLegGroup.rotation.x = -angle;
        rightLegGroup.rotation.x = angle;
      } else {
        leftArmGroup.rotation.x = 0;
        rightArmGroup.rotation.x = 0;
        leftLegGroup.rotation.x = 0;
        rightLegGroup.rotation.x = 0;
      }
    },
    triggerSwing: () => {
      let t = 0;
      const interval = setInterval(() => {
        t += 0.15;
        rightArmGroup.rotation.x = -Math.PI / 2.5 + Math.sin(t * Math.PI) * 0.8;
        if (t >= 1) {
          rightArmGroup.rotation.x = 0;
          clearInterval(interval);
        }
      }, 20);
    }
  };
}

// Name & HP Sprite generator
export function createNameTagSprite(name, hp) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  function render(currentHp) {
    ctx.clearRect(0, 0, 256, 64);
    // Background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    if (ctx.roundRect) {
      ctx.roundRect(8, 4, 240, 56, 8);
    } else {
      ctx.rect(8, 4, 240, 56);
    }

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 30);

    // HP Bar
    const hpRatio = Math.max(0, currentHp / 100);
    ctx.fillStyle = '#333333';
    ctx.fillRect(28, 38, 200, 14);

    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(28, 38, 200 * hpRatio, 14);

    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 38, 200, 14);
  }

  render(hp);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.userData = { canvas, ctx, texture, render };
  return sprite;
}

// Zombie Model
export function createZombieModel(isBaby = false, isBoss = false) {
  const group = new THREE.Group();

  // Head
  const head = createHead(zombieFaceTexture, zombieSkinMaterial);
  head.position.y = 1.5;
  group.add(head);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.25), zombieShirtMaterial);
  torso.position.y = 0.95;
  group.add(torso);

  // Zombie arms: permanently outstretched forward
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.38, 1.25, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), zombieSkinMaterial);
  leftArmMesh.position.y = -0.3;
  leftArmGroup.add(leftArmMesh);
  leftArmGroup.rotation.x = -Math.PI / 2.1; // Forward outstretched
  group.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.38, 1.25, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), zombieSkinMaterial);
  rightArmMesh.position.y = -0.3;
  rightArmGroup.add(rightArmMesh);
  rightArmGroup.rotation.x = -Math.PI / 2.1; // Forward outstretched
  group.add(rightArmGroup);

  // Left Leg
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.14, 0.65, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), zombiePantsMaterial);
  leftLegMesh.position.y = -0.32;
  leftLegGroup.add(leftLegMesh);
  group.add(leftLegGroup);

  // Right Leg
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.14, 0.65, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), zombiePantsMaterial);
  rightLegMesh.position.y = -0.32;
  rightLegGroup.add(rightLegMesh);
  group.add(rightLegGroup);

  // If Baby Zombie, scale entire model down, make head proportionately slightly larger
  if (isBaby) {
    group.scale.set(0.55, 0.55, 0.55);
    head.scale.set(1.2, 1.2, 1.2);
  }

  if (isBoss) {
    group.scale.set(1.45, 1.45, 1.45);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.18, 0.55),
      new THREE.MeshLambertMaterial({ color: 0xd4af37 })
    );
    crown.position.y = 1.9;
    group.add(crown);
    const aura = new THREE.PointLight(0xff3333, 2.0, 7.0);
    aura.position.y = 1.5;
    group.add(aura);
  }

  // Keep hit feedback local to this zombie. The original prototype shared
  // materials, which could flash every zombie when just one was hit.
  group.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material = Array.isArray(child.material)
      ? child.material.map(m => m.clone())
      : child.material.clone();
  });

  let damageTimeout = null;
  const setDamageFlash = (active) => {
    group.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (m.emissive) m.emissive.setHex(active ? 0x661111 : 0x000000);
      });
    });
  };

  return {
    root: group,
    isBaby,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup,
    updateAnim: (time, isMoving) => {
      if (isMoving) {
        const animSpeed = isBaby ? 14 : 7;
        const legAngle = Math.sin(time * animSpeed) * 0.5;
        leftLegGroup.rotation.x = legAngle;
        rightLegGroup.rotation.x = -legAngle;
      } else {
        leftLegGroup.rotation.x = 0;
        rightLegGroup.rotation.x = 0;
      }
    },
    flashHit: () => {
      if (damageTimeout) clearTimeout(damageTimeout);
      setDamageFlash(true);
      damageTimeout = setTimeout(() => {
        setDamageFlash(false);
      }, 150);
    }
  };
}

// Item: Floating Sword Pickup
export function createSwordPickup() {
  const group = new THREE.Group();
  const sword = createSwordMesh();
  sword.scale.set(1.4, 1.4, 1.4);
  sword.position.y = 0.5;
  group.add(sword);

  // Ground pedestal / light ring
  const ringGeo = new THREE.RingGeometry(0.3, 0.45, 16);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x33e1e6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  group.add(ring);

  return {
    root: group,
    update: (time) => {
      sword.rotation.y = time * 2;
      sword.position.y = 0.5 + Math.sin(time * 3) * 0.12;
    }
  };
}

// Item: Floating Bandage Pickup
export function createBandagePickup() {
  const group = new THREE.Group();

  // White box with Red Cross texture
  const materials = [
    new THREE.MeshLambertMaterial({ map: bandageTexture }),
    new THREE.MeshLambertMaterial({ map: bandageTexture }),
    new THREE.MeshLambertMaterial({ map: bandageTexture }),
    new THREE.MeshLambertMaterial({ map: bandageTexture }),
    new THREE.MeshLambertMaterial({ map: bandageTexture }),
    new THREE.MeshLambertMaterial({ map: bandageTexture })
  ];
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), materials);
  box.position.y = 0.5;
  group.add(box);

  // Green ground ring
  const ringGeo = new THREE.RingGeometry(0.25, 0.38, 16);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.05;
  group.add(ring);

  return {
    root: group,
    update: (time) => {
      box.rotation.y = time * 1.8;
      box.position.y = 0.5 + Math.sin(time * 3 + 1) * 0.1;
    }
  };
}

// Item: Floating Crypt Key
export function createKeyPickup() {
  const group = new THREE.Group();

  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.12),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f })
  );
  shaft.position.y = 0.55;
  group.add(shaft);

  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.06, 8, 16),
    new THREE.MeshLambertMaterial({ color: 0xffd85a })
  );
  bow.position.y = 0.82;
  bow.rotation.x = Math.PI / 2;
  group.add(bow);

  const tooth = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.10, 0.10),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f })
  );
  tooth.position.set(0.08, 0.31, 0);
  group.add(tooth);

  const ringGeo = new THREE.RingGeometry(0.28, 0.42, 18);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide })
  );
  ring.position.y = 0.04;
  group.add(ring);

  return {
    root: group,
    update: (time) => {
      group.rotation.y = time * 1.7;
      group.position.y = Math.sin(time * 3) * 0.08;
    }
  };
}

// Deepest Treasure: Golden Chest / Altar
export function createTreasureChest() {
  const group = new THREE.Group();

  // Altar Base (Obsidian/Stone pedestal)
  const baseGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.2;
  group.add(base);

  // Gold Chest
  const chestGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
  const chestMat = new THREE.MeshLambertMaterial({ map: goldTexture });
  const chest = new THREE.Mesh(chestGeo, chestMat);
  chest.position.y = 0.7;
  group.add(chest);

  // Golden Point Light
  const light = new THREE.PointLight(0xffd700, 2.0, 7.0);
  light.position.set(0, 1.2, 0);
  group.add(light);

  // Glowing beacon particles around chest
  const beaconGeo = new THREE.CylinderGeometry(0.4, 0.4, 3, 12, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide
  });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 1.9;
  group.add(beacon);

  return {
    root: group,
    update: (time) => {
      beacon.rotation.y = time * 1.5;
      light.intensity = 1.8 + Math.sin(time * 4) * 0.5;
    }
  };
}

// Torch mesh (lightweight without heavy dynamic PointLight)
export function createTorch(wallNormal) {
  const group = new THREE.Group();

  // Wooden post
  const postGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.y = 0;
  group.add(post);

  // Glowing Flame (MeshBasicMaterial is self-illuminating without GPU light cost)
  const flameGeo = new THREE.BoxGeometry(0.12, 0.14, 0.12);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9922 });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 0.22;
  group.add(flame);

  return {
    root: group,
    update: (time) => {
      // Flame scale flicker
      const s = 1.0 + Math.sin(time * 15) * 0.08;
      flame.scale.set(s, s, s);
    }
  };
}
