// input.js - Handles Keyboard and On-Screen Mobile Joystick/Buttons

class InputManager {
    constructor() {
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false,
            light: false, // H
            heavy: false, // J
            kick: false,  // K
            special: false, // L
            pause: false, // P
            escape: false // ESC
        };

        this.previousKeys = { ...this.keys };
        this.justPressed = { ...this.keys };

        this.joystick = null;

        this.initKeyboard();
        this.initMobileControls();
    }

    update() {
        // Calculate justPressed for this frame
        for (let key in this.keys) {
            this.justPressed[key] = this.keys[key] && !this.previousKeys[key];
            this.previousKeys[key] = this.keys[key];
        }
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.up = true; break;
                case 'KeyS': this.keys.down = true; break;
                case 'KeyA': this.keys.left = true; break;
                case 'KeyD': this.keys.right = true; break;
                case 'KeyH': this.keys.light = true; break;
                case 'KeyJ': this.keys.heavy = true; break;
                case 'KeyK': this.keys.kick = true; break;
                case 'KeyL': this.keys.special = true; break;
                case 'KeyP': this.keys.pause = true; break;
                case 'Escape': this.keys.escape = true; break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.up = false; break;
                case 'KeyS': this.keys.down = false; break;
                case 'KeyA': this.keys.left = false; break;
                case 'KeyD': this.keys.right = false; break;
                case 'KeyH': this.keys.light = false; break;
                case 'KeyJ': this.keys.heavy = false; break;
                case 'KeyK': this.keys.kick = false; break;
                case 'KeyL': this.keys.special = false; break;
                case 'KeyP': this.keys.pause = false; break;
                case 'Escape': this.keys.escape = false; break;
            }
        });
    }

    initMobileControls() {
        // Only initialize touch if on mobile
        const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (isTouchDevice) {
            document.getElementById('mobileControls').classList.remove('hidden');

            // 1. Setup Joystick
            const zone = document.getElementById('joystickZone');
            this.joystick = nipplejs.create({
                zone: zone,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'white',
                size: 100
            });

            this.joystick.on('move', (evt, data) => {
                const threshold = 0.3; // minimum distance to trigger move
                if (data.force > threshold) {
                    const angle = data.angle.degree;
                    // Reset
                    this.keys.up = false;
                    this.keys.down = false;
                    this.keys.left = false;
                    this.keys.right = false;

                    // 8-way directional parsing
                    if (angle > 45 && angle < 135) this.keys.up = true;
                    if (angle > 225 && angle < 315) this.keys.down = true;
                    if (angle > 135 && angle < 225) this.keys.left = true;
                    if (angle < 45 || angle > 315) this.keys.right = true;
                }
            });

            this.joystick.on('end', () => {
                this.keys.up = false;
                this.keys.down = false;
                this.keys.left = false;
                this.keys.right = false;
            });

            // 2. Setup Action Buttons
            const btnLight = document.getElementById('btnLight');
            const btnHeavy = document.getElementById('btnHeavy');
            const btnKick = document.getElementById('btnKick');
            const btnSpecial = document.getElementById('btnSpecial');

            const bindTouch = (btn, keyName) => {
                btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[keyName] = true; });
                btn.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[keyName] = false; });
                btn.addEventListener('touchcancel', (e) => { e.preventDefault(); this.keys[keyName] = false; });
            };

            bindTouch(btnLight, 'light');
            bindTouch(btnHeavy, 'heavy');
            bindTouch(btnKick, 'kick');
            bindTouch(btnSpecial, 'special');

        } else {
            // Not a touch device, hide mobile controls
            document.getElementById('mobileControls').classList.add('hidden');
        }
    }

    // Pack input state for network transmission
    getState() {
        return {
            up: this.keys.up,
            down: this.keys.down,
            left: this.keys.left,
            right: this.keys.right,
            light: this.keys.light,
            heavy: this.keys.heavy,
            kick: this.keys.kick,
            special: this.keys.special
        };
    }
}
