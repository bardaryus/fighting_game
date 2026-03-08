// fighter.js - Fighter logic, physics, and sprite rendering
// ─────────────────────────────────────────────────────────
// COORDINATE SYSTEM:
//   origin = top-left of canvas (1024 x 576)
//   FLOOR_Y = Y coordinate of the ground surface
//   Each fighter stores (footX, footY) = position of their feet (anchor point)
//   hitbox spans: x=[footX - width/2 .. footX + width/2], y=[footY - height .. footY]

const GRAVITY = 0.8;
const FLOOR_Y = 510;   // Y pixel where feet touch the ground (arena floor)
const CANVAS_W = 1024;

// Hitbox dimensions (physics/collision only)
const HITBOX_W = 100;
const HITBOX_H = 260;

// Visual sprite draw height in pixels (width derived from frame aspect ratio)
const DRAW_H = 340;

const STATES = {
    IDLE: 'idle', WALK: 'walk', JUMP: 'jump', FALL: 'fall',
    ATTACK: 'attack', HURT: 'hurt', DEAD: 'dead'
};

// ── HSL helpers ─────────────────────────────────────────────
function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return [h, s, l];
}
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

// ── Sprite sheet loading ─────────────────────────────────────
// Both characters use the same Street Fighter sprite sheet.
// P2's clothing gets a blue hue shift while skin tone is preserved.
const fighterSprite1 = new Image();
let fighterSprite2Tinted = null; // Pre-processed canvas for P2

function preprocessP2Sprite() {
    const src = fighterSprite1;
    if (!src.complete || src.naturalWidth === 0) return;
    const W = src.naturalWidth, H = src.naturalHeight;
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(src, 0, 0);
    const imgData = offCtx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a < 10) continue;
        // Skin tone: warm, mid-to-bright, reddish (R > G > B, luminance > 90)
        const lum = (r + g + b) / 3;
        const isSkin = r > 110 && g > 65 && b < 180 && r >= g && g >= b * 0.65 && lum > 90;
        if (!isSkin) {
            // Hue-rotate clothing/dark pixels ~200° toward blue
            const [h, s, l] = rgbToHsl(r / 255, g / 255, b / 255);
            const newH = (h + 200 / 360) % 1;
            const [nr, ng, nb] = hslToRgb(newH, Math.min(s * 1.4, 1), l);
            d[i] = Math.round(nr * 255);
            d[i + 1] = Math.round(ng * 255);
            d[i + 2] = Math.round(nb * 255);
        }
    }
    offCtx.putImageData(imgData, 0, 0);
    fighterSprite2Tinted = off;
}

fighterSprite1.onload = preprocessP2Sprite;
// Cache busting (?v=1) added to force refresh on GitHub
fighterSprite1.src = 'fighter_sprite_sheet_transparent.png?v=1';

// 4 frames in a single horizontal row: Idle | Walk | Attack | Hurt
const FRAMES = { IDLE: 0, WALK: 1, ATTACK: 2, HURT: 3 };

// ── Fighter class ───────────────────────────────────────────
class Fighter {
    constructor(isP1, charType = 1) {
        this.isP1 = isP1;
        this.charType = charType;
        this.color = isP1 ? '#d32f2f' : '#2196f3';

        // Foot anchor position (feet = bottom-center of hitbox)
        this.footX = isP1 ? 250 : CANVAS_W - 250;
        this.footY = FLOOR_Y;

        this.vx = 0;
        this.vy = 0;

        // Physics hitbox size
        this.width = HITBOX_W;
        this.height = HITBOX_H;

        // Stats
        this.maxHealth = 1000;
        this.health = this.maxHealth;
        this.state = STATES.IDLE;
        this.facingRight = isP1;

        // Attack box
        this.attackBox = { width: 0, height: 0, offsetX: 0, offsetY: 0, active: false };
        this.currentAttack = null;
        this.attackTimer = 0;
        this.hitEnemy = false;
        this.hurtTimer = 0;
    }

    // ── Computed hitbox corners (for collision checks in main.js) ──
    get x() { return this.footX - this.width / 2; }
    get y() { return this.footY - this.height; }
    set x(val) { this.footX = val + this.width / 2; }
    set y(val) { this.footY = val + this.height; }

    // ── Frame data ──────────────────────────────────────────
    attacks = {
        light: { damage: 40, startup: 5, active: 6, recovery: 15, rangeX: 60, rangeY: 20, offsetX: 0, offsetY: 20, hitstun: 15, knockback: { x: 3, y: -2 } },
        heavy: { damage: 90, startup: 15, active: 8, recovery: 25, rangeX: 80, rangeY: 30, offsetX: 0, offsetY: 20, hitstun: 25, knockback: { x: 8, y: -4 } },
        kick: { damage: 60, startup: 10, active: 8, recovery: 20, rangeX: 70, rangeY: 30, offsetX: 0, offsetY: 60, hitstun: 20, knockback: { x: 5, y: -2 } },
        special: { damage: 150, startup: 25, active: 10, recovery: 30, rangeX: 100, rangeY: 80, offsetX: 0, offsetY: 10, hitstun: 35, knockback: { x: 12, y: -8 } }
    };

    // ── Update ──────────────────────────────────────────────
    update(input) {
        // Always apply gravity and floor collision, even for dead
        this.vy += GRAVITY;
        this.footY += this.vy;

        const onGround = this.footY >= FLOOR_Y;
        if (onGround) {
            this.footY = FLOOR_Y;
            this.vy = 0;
            if (this.state === STATES.FALL || this.state === STATES.JUMP) {
                this.state = STATES.IDLE;
            }
        }

        if (this.state === STATES.DEAD) {
            this.footX += this.vx;
            const halfW = this.width / 2;
            if (this.footX - halfW < 0) this.footX = halfW;
            if (this.footX + halfW > CANVAS_W) this.footX = CANVAS_W - halfW;
            return;
        }

        // Set air state
        if (!onGround && this.state !== STATES.ATTACK && this.state !== STATES.HURT) {
            this.state = this.vy < 0 ? STATES.JUMP : STATES.FALL;
        }

        // Horizontal movement
        this.vx = 0;
        if (this.state === STATES.IDLE || this.state === STATES.WALK ||
            this.state === STATES.JUMP || this.state === STATES.FALL) {
            if (input.left) {
                this.vx = -5;
                this.facingRight = false;
                if (onGround) this.state = STATES.WALK;
            } else if (input.right) {
                this.vx = 5;
                this.facingRight = true;
                if (onGround) this.state = STATES.WALK;
            } else if (onGround) {
                this.state = STATES.IDLE;
            }

            if (input.up && onGround) {
                this.vy = -18;
                this.state = STATES.JUMP;
            }

            if (input.light) this.startAttack('light');
            else if (input.heavy) this.startAttack('heavy');
            else if (input.kick) this.startAttack('kick');
            else if (input.special) this.startAttack('special');
        }

        // Hurt timer countdown
        if (this.state === STATES.HURT) {
            this.hurtTimer--;
            if (this.hurtTimer <= 0) this.state = STATES.IDLE;
        }

        // Attack state machine
        if (this.state === STATES.ATTACK) {
            this.attackTimer++;
            const att = this.currentAttack;
            if (this.attackTimer < att.startup) {
                this.attackBox.active = false;
            } else if (this.attackTimer < att.startup + att.active) {
                this.attackBox.active = true;
                this.attackBox.width = att.rangeX;
                this.attackBox.height = att.rangeY;
                this.attackBox.offsetX = this.facingRight
                    ? this.width + att.offsetX
                    : -(att.rangeX + att.offsetX);
                this.attackBox.offsetY = att.offsetY;
            } else if (this.attackTimer < att.startup + att.active + att.recovery) {
                this.attackBox.active = false;
            } else {
                this.state = STATES.IDLE;
                this.attackBox.active = false;
            }
        }

        this.footX += this.vx;
        const halfW = this.width / 2;
        if (this.footX - halfW < 0) this.footX = halfW;
        if (this.footX + halfW > CANVAS_W) this.footX = CANVAS_W - halfW;
    }

    startAttack(type) {
        if (this.state === STATES.ATTACK) return;
        this.state = STATES.ATTACK;
        this.currentAttack = this.attacks[type];
        this.attackTimer = 0;
        this.hitEnemy = false;
        this.attackBox.active = false;
        if (this.vy === 0) this.vx = 0;
    }

    takeHit(attackData, enemyFacingRight) {
        this.health -= attackData.damage;
        if (this.health <= 0) {
            this.health = 0;
            this.state = STATES.DEAD;
            this.vy = -5;
            this.vx = enemyFacingRight ? 5 : -5;
        } else {
            this.state = STATES.HURT;
            this.hurtTimer = attackData.hitstun;
            this.attackBox.active = false;
            this.vy = attackData.knockback.y;
            this.vx = enemyFacingRight ? attackData.knockback.x : -attackData.knockback.x;
        }
    }

    // ── Draw ────────────────────────────────────────────────
    // Uses foot-anchor: sprite bottom = this.footY, center = this.footX
    // Mirror is handled by a clean save/translate/scale/restore block.
    draw(ctx) {
        // Character 1 uses the main sprite sheet, but we can expand this for Char 2 if needed.
        // For now, let's at least make sure P1 and P2 draw correctly.
        const useP2Tinted = !this.isP1 && fighterSprite2Tinted !== null;
        let sprite = useP2Tinted ? fighterSprite2Tinted : fighterSprite1;

        // If they chose the boxer, let's at least log it or try to load it (if you have the file)
        // For now, using the main tinted/untinted sheet as agreed.
        const loaded = useP2Tinted ? true : (sprite.complete && sprite.naturalWidth > 0);

        let frameIdx = FRAMES.IDLE;
        switch (this.state) {
            case STATES.WALK: frameIdx = FRAMES.WALK; break;
            case STATES.ATTACK: frameIdx = FRAMES.ATTACK; break;
            case STATES.HURT: case STATES.DEAD: frameIdx = FRAMES.HURT; break;
            case STATES.JUMP: case STATES.FALL: frameIdx = FRAMES.WALK; break;
        }

        if (loaded) {
            // Support both Image (.naturalWidth) and Canvas (.width)
            const fW = sprite.naturalWidth || sprite.width;
            const fH = sprite.naturalHeight || sprite.height;
            const frameW = fW / 4;
            const frameH = fH;

            // Fixed draw height, width preserves aspect ratio
            const dH = DRAW_H;
            const dW = dH * (frameW / frameH);

            const destX = this.footX - dW / 2;   // sprite left edge in screen space
            const destY = this.footY - dH;         // sprite top edge (feet at footY)

            ctx.save();

            // Hurt flash (overrides everything)
            if (this.state === STATES.HURT && this.hurtTimer % 4 < 2) {
                ctx.filter = 'brightness(220%)';
            }

            if (this.facingRight) {
                // No transformation needed — draw at absolute position
                ctx.drawImage(sprite, frameIdx * frameW, 0, frameW, frameH,
                    destX, destY, dW, dH);
            } else {
                // Flip around the foot center X:
                // 1. Translate coordinate origin to foot center
                // 2. Scale X by -1 (mirror)
                // 3. Draw sprite as if facing right (at negative half-width from origin)
                ctx.translate(this.footX, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(sprite, frameIdx * frameW, 0, frameW, frameH,
                    -dW / 2, destY, dW, dH);
            }

            ctx.filter = 'none';
            ctx.restore();

        } else {
            // Fallback: colored hitbox rectangle
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    // ── Network serialization ───────────────────────────────
    getState() {
        return {
            fx: this.footX, fy: this.footY,
            vx: this.vx, vy: this.vy,
            h: this.health, s: this.state,
            d: this.facingRight,
            attA: this.attackBox.active,
            attX: this.attackBox.offsetX, attY: this.attackBox.offsetY,
            attW: this.attackBox.width, attH: this.attackBox.height
        };
    }

    setState(s) {
        this.footX = s.fx; this.footY = s.fy;
        this.vx = s.vx; this.vy = s.vy;
        this.health = s.h;
        this.state = s.s;
        this.facingRight = s.d;
        this.attackBox.active = s.attA;
        this.attackBox.offsetX = s.attX;
        this.attackBox.offsetY = s.attY;
        this.attackBox.width = s.attW;
        this.attackBox.height = s.attH;
    }
}
