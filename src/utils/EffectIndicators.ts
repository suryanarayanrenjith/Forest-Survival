import * as THREE from 'three';

/**
 * Floating 3D effect indicators that hover above the player's head — one icon
 * per active power-up/ability effect. Each icon is a camera-facing sprite drawn
 * from a canvas (glyph + tinted disc). The cluster bobs gently and re-lays out
 * as effects start/stop. Anchored in world space above the player so it reads
 * as "over the player" and is visible to other players in multiplayer.
 */

export type EffectKey = 'shield' | 'speed' | 'damage' | 'overcharge' | 'phantom' | 'infinite_ammo';

interface EffectVisual {
  glyph: string;
  color: string; // hex string for canvas
}

const EFFECT_VISUALS: Record<EffectKey, EffectVisual> = {
  shield: { glyph: '🛡', color: '#55b0ff' },
  speed: { glyph: '🏃', color: '#6ef0ff' },
  damage: { glyph: '💥', color: '#ff8a3a' },
  overcharge: { glyph: '⚡', color: '#ffd23f' },
  phantom: { glyph: '👻', color: '#b388ff' },
  infinite_ammo: { glyph: '∞', color: '#ff5aff' },
};

const ICON_WORLD_SIZE = 0.7;
const ICON_SPACING = 0.85;
const HEIGHT_ABOVE_PLAYER = 2.6; // above the player's feet/world position

function makeIconTexture(visual: EffectVisual): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Tinted glowing disc
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 6, cx, cx, cx);
  grad.addColorStop(0, `${visual.color}ee`);
  grad.addColorStop(0.7, `${visual.color}88`);
  grad.addColorStop(1, `${visual.color}00`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cx, cx, 0, Math.PI * 2);
  ctx.fill();

  // Ring
  ctx.strokeStyle = '#ffffffcc';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cx, cx - 12, 0, Math.PI * 2);
  ctx.stroke();

  // Glyph
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(visual.glyph, cx, cx + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class EffectIndicators {
  private group: THREE.Group;
  private sprites = new Map<EffectKey, THREE.Sprite>();
  private textures = new Map<EffectKey, THREE.CanvasTexture>();
  private current: EffectKey[] = [];

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.renderOrder = 999;
    scene.add(this.group);
  }

  private getSprite(key: EffectKey): THREE.Sprite {
    let sprite = this.sprites.get(key);
    if (!sprite) {
      const tex = makeIconTexture(EFFECT_VISUALS[key]);
      this.textures.set(key, tex);
      const material = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(ICON_WORLD_SIZE);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }

  /**
   * Sync the visible icons to the active-effect set and reposition above the
   * player. Call every frame.
   */
  update(activeEffects: EffectKey[], playerPos: THREE.Vector3, timeSec: number): void {
    // Add/remove sprites as the active set changes.
    const next = activeEffects.filter((k) => k in EFFECT_VISUALS);
    const changed =
      next.length !== this.current.length || next.some((k, i) => k !== this.current[i]);

    if (changed) {
      // Detach all, then re-attach the current set (cheap — handful of icons).
      this.sprites.forEach((sprite) => {
        if (sprite.parent) sprite.parent.remove(sprite);
      });
      for (const key of next) {
        this.group.add(this.getSprite(key));
      }
      this.current = next;
    }

    if (next.length === 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Anchor above the player with a gentle bob.
    const bob = Math.sin(timeSec * 2.2) * 0.08;
    this.group.position.set(playerPos.x, playerPos.y + HEIGHT_ABOVE_PLAYER + bob, playerPos.z);

    // Lay icons out in a centered horizontal row (local space; sprites always
    // face the camera so the row stays readable from any angle).
    const totalWidth = (next.length - 1) * ICON_SPACING;
    next.forEach((key, i) => {
      const sprite = this.sprites.get(key)!;
      sprite.position.set(-totalWidth / 2 + i * ICON_SPACING, 0, 0);
    });
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.sprites.forEach((sprite) => {
      (sprite.material as THREE.SpriteMaterial).dispose();
    });
    this.textures.forEach((tex) => tex.dispose());
    this.sprites.clear();
    this.textures.clear();
  }
}
