// network.js - WebRTC PeerJS wrapper for Fighting Game

class NetworkManager {
    constructor(isHost) {
        this.isHost = isHost;
        this.peer = null;
        this.hostConn = null;     // Client uses this to track connection to host
        this.clientConn = null;   // Host uses this to track the single connected client

        this.myId = null;
        this.roomCode = null;

        // Callbacks
        this.onHostCreated = null;        // (roomCode)
        this.onPlayerJoined = null;       // (playerData)
        this.onPlayerDisconnect = null;   // ()
        this.onClientConnected = null;    // () -> Triggered on client when accepted

        this.onHostData = null;           // (data) - Host receiving from client (e.g., Inputs)
        this.onClientData = null;         // (data) - Client receiving from host (e.g., Gamestate)
    }

    generateCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        return code;
    }

    initHost() {
        this.roomCode = this.generateCode();
        // PeerJS ID will be prefixed to reduce global collisions
        let fullId = 'sf-fight-' + this.roomCode;

        this.peer = new Peer(fullId);

        this.peer.on('open', (id) => {
            this.myId = id;
            if (this.onHostCreated) this.onHostCreated(this.roomCode);
        });

        this.peer.on('connection', (conn) => {
            // As a fighting game, we only allow 1 client.
            if (this.clientConn) {
                // Reject connection if already full
                conn.on('open', () => {
                    conn.send({ type: 'LOBBY_FULL' });
                    setTimeout(() => conn.close(), 500);
                });
                return;
            }

            conn.on('open', () => {
                this.clientConn = conn;

                // When connection opens, expect a JOIN payload
                conn.on('data', (data) => {
                    if (data.type === 'JOIN') {
                        if (this.onPlayerJoined) this.onPlayerJoined(data.playerData);
                        // Tell client they are accepted
                        conn.send({ type: 'ACCEPTED', yourId: conn.peer });
                    } else if (data.type === 'INPUT') {
                        // Receiving client input
                        if (this.onHostData) this.onHostData(data.input);
                    }
                });

                conn.on('close', () => {
                    this.clientConn = null;
                    if (this.onPlayerDisconnect) this.onPlayerDisconnect();
                });
            });
        });

        this.peer.on('error', (err) => {
            console.error(err);
        });
    }

    initClient(targetCode, playerData) {
        this.peer = new Peer(); // Auto-assign a client ID

        this.peer.on('open', (id) => {
            this.myId = id;
            let hostId = 'sf-fight-' + targetCode;

            this.hostConn = this.peer.connect(hostId);

            this.hostConn.on('open', () => {
                // Intro msg
                this.hostConn.send({ type: 'JOIN', playerData: playerData });
            });

            this.hostConn.on('data', (data) => {
                if (data.type === 'ACCEPTED') {
                    if (this.onClientConnected) this.onClientConnected();
                } else if (data.type === 'LOBBY_FULL') {
                    alert("Oda dolu!");
                    location.reload();
                } else if (data.type === 'STATE_UPDATE' || data.type === 'EVENT' || data.type === 'START_GAME') {
                    if (this.onClientData) this.onClientData(data);
                }
            });

            this.hostConn.on('close', () => {
                alert("Kurucu ile bağlantı koptu!");
                location.reload();
            });
        });

        this.peer.on('error', (err) => {
            console.error(err);
            alert("Bağlantı hatası: Oda bulunamadı veya ağ sorunu.");
        });
    }

    // Host sending to client
    sendToClient(data) {
        if (this.clientConn && this.clientConn.open) {
            this.clientConn.send(data);
        }
    }

    // Client sending to host
    sendToHost(data) {
        if (this.hostConn && this.hostConn.open) {
            this.hostConn.send(data);
        }
    }
}
