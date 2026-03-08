// main.js - Core Game Loop, State sync, and UI Management

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let GAME_STATE = 'MENU'; // MENU, LOBBY, PLAYING, ROUND_END, PAUSED
let isHost = false;
let isSinglePlayer = false;
let selectedCharType = 1; // 1: Fighter 1, 2: Fighter 2
let network = null;
let input = new InputManager();

// Background Image
const bgImage = new Image();
// We'll set src later dynamically once image generates, default:
bgImage.src = 'fighting_arena_bg.png';

let isPaused = false; // Internal pause tracking
let gameMenuOpen = false; // Escape menu tracking

// Game Entities
let p1 = new Fighter(true);
let p2 = new Fighter(false);

// Round Data
let rounds = { p1: 0, p2: 0, current: 1 };
let timer = 99;
let frameCount = 0;
let roundEnded = false;

// Client P2 Input buffer (If Host)
let p2InputBuffer = { up: false, down: false, left: false, right: false, light: false, heavy: false, kick: false, special: false };

/* --- UI Elements --- */
const screens = {
    main: document.getElementById('mainMenu'),
    roundSelect: document.getElementById('roundSelectMenu'),
    charSelect: document.getElementById('charSelectMenu'),
    stageSelect: document.getElementById('stageSelectMenu'),
    hostLobby: document.getElementById('hostLobby'),
    escMenu: document.getElementById('escMenu'), // NEW
    wrapper: document.getElementById('screens')
};

const ui = {
    p1Name: document.getElementById('p1Name'),
    p2Name: document.getElementById('p2Name'),
    p1Health: document.getElementById('p1Health'),
    p1HealthDmg: document.getElementById('p1HealthDmg'),
    p2Health: document.getElementById('p2Health'),
    p2HealthDmg: document.getElementById('p2HealthDmg'),
    timer: document.getElementById('timer'),
    announcement: document.getElementById('announcement'),
    gameUI: document.getElementById('gameUI')
};

function switchScreen(screen) {
    screens.main.classList.add('hidden');
    screens.roundSelect.classList.add('hidden');
    screens.charSelect.classList.add('hidden');
    screens.stageSelect.classList.add('hidden');
    screens.hostLobby.classList.add('hidden');
    if (screens.escMenu) screens.escMenu.classList.add('hidden');

    if (!screen) {
        screens.wrapper.classList.add('hidden');
    } else {
        screens.wrapper.classList.remove('hidden');
        screen.classList.remove('hidden');
    }
}

// In-Game Menu logic
function toggleEscMenu() {
    gameMenuOpen = !gameMenuOpen;
    if (gameMenuOpen) {
        screens.wrapper.classList.remove('hidden');
        screens.escMenu.classList.remove('hidden');
    } else {
        screens.wrapper.classList.add('hidden');
        screens.escMenu.classList.add('hidden');
    }
}

/* --- Single Player AI Logic --- */
function calculateBotAI(bot, player) {
    let out = { up: false, down: false, left: false, right: false, light: false, heavy: false, kick: false, special: false };

    if (bot.state === STATES.HURT || bot.state === STATES.DEAD) return out;

    let dist = player.x - bot.x;
    let absDist = Math.abs(dist);

    // Movement
    if (absDist > 120) {
        // Move towards player
        if (dist > 0) out.right = true;
        else out.left = true;
    } else if (absDist < 50) {
        // Occasionally back away
        if (Math.random() < 0.05) {
            if (dist > 0) out.left = true;
            else out.right = true;
        }
    }

    // Attacking
    if (absDist <= 130 && bot.state !== STATES.ATTACK) {
        // 5% chance per frame to attack when in range
        if (Math.random() < 0.05) {
            let rnd = Math.random();
            if (rnd < 0.4) out.light = true;
            else if (rnd < 0.7) out.heavy = true;
            else if (rnd < 0.9) out.kick = true;
            else out.special = true;
        }
    }

    // Occasional Jump
    if (Math.random() < 0.01 && bot.vy === 0) {
        out.up = true;
    }

    return out;
}

/* --- Menu Interactions --- */
let tempPlayerName = '';

document.getElementById('btnSinglePlayer').addEventListener('click', () => {
    isHost = true;
    isSinglePlayer = true;
    tempPlayerName = document.getElementById('playerNameInput').value || 'P1';
    switchScreen(screens.roundSelect);
});

document.getElementById('btnGoToHost').addEventListener('click', () => {
    isHost = true;
    isSinglePlayer = false;
    tempPlayerName = document.getElementById('playerNameInput').value || 'Host';
    switchScreen(screens.roundSelect);
});

document.getElementById('btnConfirmRounds').addEventListener('click', () => {
    switchScreen(screens.charSelect);
});

// New Select Character UI Function
function selectCharacter(type) {
    selectedCharType = type;
    // Update active class
    const cards = screens.charSelect.querySelectorAll('.char-card');
    cards.forEach((c, idx) => {
        if (idx === type - 1) c.classList.add('active');
        else c.classList.remove('active');
    });
}
window.selectCharacter = selectCharacter; // Expose to HTML inline onclick

document.getElementById('btnConfirmChar').addEventListener('click', () => {
    // Only 1 char available, moving to stage for Host, or Waiting for Client
    if (isHost) {
        switchScreen(screens.stageSelect);
    } else {
        // Client Flow: Character selected, now wait for Host to start
        document.getElementById('btnConfirmChar').innerText = "Bekleniyor...";
        document.getElementById('btnConfirmChar').disabled = true;

        // Let Host know we are ready (though host starts automatically on join mostly, 
        // to conform with previous logic we just wait for START_GAME event)
    }
});

document.getElementById('btnConfirmStage').addEventListener('click', () => {
    // Stage selected. Finalize initialization.
    ui.p1Name.innerText = tempPlayerName;

    if (isSinglePlayer) {
        ui.p2Name.innerText = "CPU";
        startGame();
    } else {
        // Init Host Network
        network = new NetworkManager(true);
        network.onHostCreated = (code) => {
            document.getElementById('displayRoomCode').innerText = code;
            switchScreen(screens.hostLobby);
        };

        network.onPlayerJoined = (playerData) => {
            ui.p2Name.innerText = playerData.name || 'Client';
            // Broadcast Start Game
            setTimeout(() => {
                network.sendToClient({ type: 'START_GAME', p1Name: tempPlayerName, p2Name: playerData.name, p1Char: selectedCharType });
                startGame();
            }, 1000);
        };

        network.onHostData = (data) => {
            // Host receives client inputs
            p2InputBuffer = data;
        };

        network.onPlayerDisconnect = () => {
            alert("Oyun koptu. Ana menüye dönülüyor.");
            location.reload();
        };

        network.initHost();
    }
});

document.getElementById('btnJoinRoom').addEventListener('click', () => {
    isHost = false;
    isSinglePlayer = false;
    tempPlayerName = document.getElementById('playerNameInput').value || 'P2';
    let code = document.getElementById('roomCodeInput').value.toUpperCase();

    if (code.length < 4) return alert("Geçerli bir kod girin.");

    network = new NetworkManager(false);
    network.onClientConnected = () => {
        console.log("Bağlandı, oyunun başlaması bekleniyor...");
        switchScreen(screens.charSelect); // Client goes to Char Select after connecting
    };

    network.onClientData = (data) => {
        if (data.type === 'START_GAME') {
            ui.p1Name.innerText = data.p1Name;
            ui.p2Name.innerText = data.p2Name || tempPlayerName;
            // Host sends their char type, Client uses the one they picked
            startGame(data.p1Char, selectedCharType);
        } else if (data.type === 'STATE_UPDATE') {
            applyGameState(data);
        } else if (data.type === 'EVENT') {
            handleEventData(data);
        } else if (data.type === 'PAUSE_TOGGLE') {
            isPaused = data.isPaused;
            if (isPaused) showAnnouncement("PAUSED", 0);
            else ui.announcement.classList.add('hidden');
        }
    };

    network.initClient(code, { name: tempPlayerName });
});

// ESC Menu Return function
document.addEventListener('DOMContentLoaded', () => {
    // Assuming we added the HTML for escMenu
    const btnReturnMenu = document.getElementById('btnReturnMenu');
    if (btnReturnMenu) {
        btnReturnMenu.addEventListener('click', () => {
            location.reload(); // Quickest way to close peer connections and return
        });
    }
});


/* --- Game Engine --- */

function startGame(charType1, charType2) {
    // Default charTypes from selections
    if (charType1 === undefined) charType1 = selectedCharType;
    if (charType2 === undefined) charType2 = isSinglePlayer ? (selectedCharType === 1 ? 2 : 1) : selectedCharType;

    switchScreen(null); // Hide menus
    ui.gameUI.classList.remove('hidden');
    GAME_STATE = 'PLAYING';
    isPaused = false;
    gameMenuOpen = false;

    p1 = new Fighter(true, charType1);
    p2 = new Fighter(false, charType2);

    resetRound();
    frameCount = 0;
    roundEnded = false;

    ui.p1Health.style.transform = `scaleX(1)`;
    ui.p2Health.style.transform = `scaleX(1)`;
    requestAnimationFrame(gameLoop);
}

function resetRound() {
    timer = 99;
    frameCount = 0;
    roundEnded = false; // ← critical: allow game logic to run again

    // Reset fighter positions and health for new round
    p1.footX = 250;
    p1.footY = FLOOR_Y;
    p1.vx = 0; p1.vy = 0;
    p1.health = p1.maxHealth;
    p1.state = STATES.IDLE;
    p1.attackBox.active = false;
    p1.facingRight = true;

    p2.footX = CANVAS_W - 250;
    p2.footY = FLOOR_Y;
    p2.vx = 0; p2.vy = 0;
    p2.health = p2.maxHealth;
    p2.state = STATES.IDLE;
    p2.attackBox.active = false;
    p2.facingRight = false;

    // Reset all health bars
    ui.p1Health.style.transform = `scaleX(1)`;
    ui.p2Health.style.transform = `scaleX(1)`;
    ui.p1HealthDmg.style.transform = `scaleX(1)`;
    ui.p2HealthDmg.style.transform = `scaleX(1)`;

    showAnnouncement(`ROUND ${rounds.current}`, 1500, () => {
        showAnnouncement("FIGHT!", 1000);
    });
}

function showAnnouncement(text, duration, callback) {
    ui.announcement.innerText = text;
    ui.announcement.classList.remove('hidden');

    if (duration > 0) {
        setTimeout(() => {
            ui.announcement.classList.add('hidden');
            if (callback) callback();
        }, duration);
    }
}

function checkCollision(attacker, target) {
    if (!attacker.attackBox.active) return false;
    if (attacker.hitEnemy) return false; // Already hit this attack

    let hx = attacker.x + attacker.attackBox.offsetX;
    let hy = attacker.y + attacker.attackBox.offsetY;
    let hw = attacker.attackBox.width;
    let hh = attacker.attackBox.height;

    // AABB Collision target vs hitbox
    if (hx < target.x + target.width &&
        hx + hw > target.x &&
        hy < target.y + target.height &&
        hy + hh > target.y) {
        return true;
    }
    return false;
}

function handleHit(attacker, target) {
    attacker.hitEnemy = true;
    target.takeHit(attacker.currentAttack, attacker.facingRight);
    audio.playHit();

    // Check KO
    if (target.health <= 0 && !roundEnded) {
        triggerKO(attacker.isP1 ? 1 : 2);
    }
}

function triggerKO(winner) {
    roundEnded = true;
    audio.playKO();
    showAnnouncement("K.O.!", 2000, () => {
        if (winner === 1) rounds.p1++;
        else rounds.p2++;

        updateRoundUI();

        if (rounds.p1 >= 2 || rounds.p2 >= 2) {
            showAnnouncement(`PLAYER ${winner} WINS!`, 0); // Stays on screen
            if (isHost && !isSinglePlayer) network.sendToClient({ type: 'EVENT', event: 'MATCH_OVER', winner: winner });
        } else {
            rounds.current++;
            resetRound();
            if (isHost && !isSinglePlayer) network.sendToClient({ type: 'EVENT', event: 'NEXT_ROUND' });
        }
    });

    if (isHost && !isSinglePlayer) {
        network.sendToClient({ type: 'EVENT', event: 'KO', winner: winner });
    }
}

function updateRoundUI() {
    if (rounds.p1 >= 1) document.getElementById('p1R1').classList.add('won');
    if (rounds.p1 >= 2) document.getElementById('p1R2').classList.add('won');
    // Reverse for P2 visually if needed
    if (rounds.p2 >= 1) document.getElementById('p2R1').classList.add('won');
    if (rounds.p2 >= 2) document.getElementById('p2R2').classList.add('won');
}

function updateHealthUI() {
    let p1P = Math.max(0, p1.health / p1.maxHealth);
    let p2P = Math.max(0, p2.health / p2.maxHealth);

    ui.p1Health.style.transform = `scaleX(${p1P})`;
    ui.p2Health.style.transform = `scaleX(${p2P})`;

    // Delayed dmg bars
    setTimeout(() => {
        ui.p1HealthDmg.style.transform = `scaleX(${p1P})`;
        ui.p2HealthDmg.style.transform = `scaleX(${p2P})`;
    }, 1000); // 1 sec delay on damage bar drop
}

function hostUpdate() {
    // 1. Process Inputs
    let p1In = input.getState();
    let p2In = p2InputBuffer;

    // Handle Pause (Host only logic to toggle pause)
    if (input.justPressed.pause || input.justPressed.escape) {
        if (input.justPressed.escape) toggleEscMenu();

        isPaused = !isPaused;
        if (isPaused) showAnnouncement("PAUSED", 0);
        else ui.announcement.classList.add('hidden');
        // Notify client about pause state
        if (!isSinglePlayer) network.sendToClient({ type: 'PAUSE_TOGGLE', isPaused: isPaused });
    }

    if (isPaused) {
        // Broadcast paused state to client
        if (!isSinglePlayer) {
            let payload = {
                type: 'STATE_UPDATE',
                t: timer,
                r: roundEnded,
                p1: p1.getState(),
                p2: p2.getState()
            };
            network.sendToClient(payload);
        }
        return; // Don't run game logic
    }

    if (!roundEnded && GAME_STATE === 'PLAYING' && ui.announcement.classList.contains('hidden')) {
        // Face each other logic (don't flip if attacking or in air or dead)
        if (p1.state !== STATES.ATTACK && p2.state !== STATES.ATTACK && p1.vy === 0 && p2.vy === 0) {
            if (p1.x < p2.x) {
                p1.facingRight = true;
                p2.facingRight = false;
            } else {
                p1.facingRight = false;
                p2.facingRight = true;
            }
        }

        // Timer
        frameCount++;
        if (frameCount >= 60) {
            frameCount = 0;
            if (timer > 0) {
                timer--;
                ui.timer.innerText = timer;
                if (timer === 0 && !roundEnded) {
                    // Time Over logic
                    if (p1.health > p2.health) triggerKO(1);
                    else if (p2.health > p1.health) triggerKO(2);
                    else triggerKO(0); // Draw
                }
            }
        }

        // Single Player AI calculate
        if (isSinglePlayer) {
            p2In = calculateBotAI(p2, p1);
        }

        // Apply
        p1.update(p1In);
        p2.update(p2In);

        // Sound swing
        if (p1In.light || p1In.heavy || p1In.kick || p1In.special ||
            p2In.light || p2In.heavy || p2In.kick || p2In.special) {
            audio.playSwing();
        }

        // Collisions
        if (checkCollision(p1, p2)) handleHit(p1, p2);
        if (checkCollision(p2, p1)) handleHit(p2, p1);

        updateHealthUI();
    } else {
        // Only update physics (falling dead bodies)
        p1.update({ up: false, down: false, left: false, right: false, light: false, heavy: false, kick: false, special: false });
        p2.update({ up: false, down: false, left: false, right: false, light: false, heavy: false, kick: false, special: false });
    }

    // 2. Broadcast State
    if (!isSinglePlayer) {
        let payload = {
            type: 'STATE_UPDATE',
            t: timer,
            r: roundEnded,
            p1: p1.getState(),
            p2: p2.getState()
        };
        network.sendToClient(payload);
    }
}

function clientUpdate() {
    // 1. Send Input to Host
    input.update();
    network.sendToHost({ type: 'INPUT', input: input.getState() });

    // Client handles ESC menu locally
    if (input.justPressed.escape) {
        toggleEscMenu();
    }
}

function applyGameState(data) {
    p1.setState(data.p1);
    p2.setState(data.p2);

    if (timer !== data.t) {
        timer = data.t;
        ui.timer.innerText = timer;
    }

    updateHealthUI();
}

function handleEventData(data) {
    if (data.event === 'KO') {
        roundEnded = true;
        audio.playKO();
        showAnnouncement("K.O.!", 2000);
        if (data.winner === 1) rounds.p1++;
        else if (data.winner === 2) rounds.p2++;
        updateRoundUI();
    } else if (data.event === 'NEXT_ROUND') {
        rounds.current++;
        resetRound();
    } else if (data.event === 'MATCH_OVER') {
        showAnnouncement(`PLAYER ${data.winner} WINS!`, 0);
    }
}


/* --- Draw Loop --- */

function draw() {
    // Clear the canvas instead of filling it with a solid grey box
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image if loaded
    if (bgImage.complete && bgImage.naturalHeight !== 0) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    }

    // Draw floor line (optional if bg image has floor)
    // ctx.strokeStyle = '#555';
    // ctx.lineWidth = 2;
    // ctx.beginPath();
    // ctx.moveTo(0, 500);
    // ctx.lineTo(canvas.width, 500);
    // ctx.stroke();

    // Draw characters (Draw dead/hurt character first so attacker overlaps)
    if (p1.state === STATES.DEAD || p1.state === STATES.HURT) {
        p1.draw(ctx);
        p2.draw(ctx);
    } else {
        p2.draw(ctx);
        p1.draw(ctx);
    }
}

/* --- Main Loop --- */

function gameLoop() {
    if (GAME_STATE !== 'PLAYING') return;

    input.update();

    if (isHost) {
        hostUpdate();
    } else {
        clientUpdate();
    }

    draw();

    requestAnimationFrame(gameLoop);
}
