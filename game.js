// Game client for MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // WebSocket connection
        this.socket = null;
        this.connected = false;
        
        // Player data
        this.myPlayerId = null;
        this.players = new Map(); // playerId -> player data
        this.avatars = new Map(); // avatarName -> avatar data
        this.avatarImages = new Map(); // avatarName -> loaded Image objects
        
        // Viewport system
        this.viewportX = 0;
        this.viewportY = 0;
        
        // Avatar rendering settings
        this.avatarSize = 32; // Base avatar size
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupEventListeners();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.draw();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.src = 'world.jpg';
    }
    
    draw() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Calculate viewport offset to center on player
        this.updateViewport();
        
        // Draw world map with viewport offset
        this.ctx.drawImage(
            this.worldImage,
            this.viewportX, this.viewportY, this.canvas.width, this.canvas.height,  // Source rectangle (viewport)
            0, 0, this.canvas.width, this.canvas.height   // Destination rectangle (full canvas)
        );
        
        // Draw all players
        this.drawPlayers();
    }
    
    updateViewport() {
        if (!this.myPlayerId || !this.players.has(this.myPlayerId)) {
            // No player data yet, show top-left corner
            this.viewportX = 0;
            this.viewportY = 0;
            return;
        }
        
        const myPlayer = this.players.get(this.myPlayerId);
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Calculate viewport offset to center on player
        this.viewportX = myPlayer.x - centerX;
        this.viewportY = myPlayer.y - centerY;
        
        // Clamp viewport to map boundaries
        this.viewportX = Math.max(0, Math.min(this.viewportX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(this.viewportY, this.worldHeight - this.canvas.height));
    }
    
    drawPlayers() {
        this.players.forEach((player, playerId) => {
            this.drawPlayer(player);
        });
    }
    
    drawPlayer(player) {
        // Convert world coordinates to screen coordinates
        const screenX = player.x - this.viewportX;
        const screenY = player.y - this.viewportY;
        
        // Skip if player is outside viewport
        if (screenX < -this.avatarSize || screenX > this.canvas.width + this.avatarSize ||
            screenY < -this.avatarSize || screenY > this.canvas.height + this.avatarSize) {
            return;
        }
        
        // Draw avatar
        this.drawAvatar(player, screenX, screenY);
        
        // Draw username label
        this.drawUsernameLabel(player.username, screenX, screenY);
    }
    
    drawAvatar(player, screenX, screenY) {
        const avatar = this.avatars.get(player.avatar);
        if (!avatar) return;
        
        // Get the appropriate frame based on direction and animation frame
        const direction = player.facing;
        const frameIndex = player.animationFrame || 0;
        const frameData = avatar.frames[direction]?.[frameIndex];
        
        if (!frameData) return;
        
        // Load avatar image if not already loaded
        if (!this.avatarImages.has(player.avatar)) {
            this.loadAvatarImages(player.avatar, avatar);
            return; // Will be drawn on next frame
        }
        
        const avatarImage = this.avatarImages.get(player.avatar);
        if (!avatarImage) return;
        
        // Calculate avatar dimensions maintaining aspect ratio
        const aspectRatio = avatarImage.width / avatarImage.height;
        let avatarWidth = this.avatarSize;
        let avatarHeight = this.avatarSize / aspectRatio;
        
        // Center the avatar on the player position
        const drawX = screenX - avatarWidth / 2;
        const drawY = screenY - avatarHeight / 2;
        
        // Handle west direction by flipping horizontally
        if (direction === 'west') {
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(avatarImage, -drawX - avatarWidth, drawY, avatarWidth, avatarHeight);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(avatarImage, drawX, drawY, avatarWidth, avatarHeight);
        }
    }
    
    drawUsernameLabel(username, screenX, screenY) {
        this.ctx.save();
        
        // Set text properties
        this.ctx.font = '12px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        
        // Draw text with outline
        this.ctx.strokeText(username, screenX, screenY - this.avatarSize / 2 - 5);
        this.ctx.fillText(username, screenX, screenY - this.avatarSize / 2 - 5);
        
        this.ctx.restore();
    }
    
    loadAvatarImages(avatarName, avatarData) {
        const image = new Image();
        image.onload = () => {
            this.avatarImages.set(avatarName, image);
            this.draw(); // Redraw when image loads
        };
        image.onerror = () => {
            console.error(`Failed to load avatar: ${avatarName}`);
        };
        
        // Use the first frame of the south direction as default
        const firstFrame = avatarData.frames.south?.[0] || avatarData.frames.north?.[0] || avatarData.frames.east?.[0];
        if (firstFrame) {
            image.src = firstFrame;
        }
    }
    
    connectToServer() {
        try {
            this.socket = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.socket.onopen = () => {
                console.log('Connected to game server');
                this.connected = true;
                this.joinGame();
            };
            
            this.socket.onmessage = (event) => {
                this.handleServerMessage(event);
            };
            
            this.socket.onclose = () => {
                console.log('Disconnected from game server');
                this.connected = false;
                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    if (!this.connected) {
                        console.log('Attempting to reconnect...');
                        this.connectToServer();
                    }
                }, 3000);
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        if (!this.connected) return;
        
        const joinMessage = {
            action: 'join_game',
            username: 'AllenG'
        };
        
        this.socket.send(JSON.stringify(joinMessage));
        console.log('Sent join game message');
    }
    
    handleServerMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
            
            switch (message.action) {
                case 'join_game':
                    this.handleJoinGameResponse(message);
                    break;
                case 'player_joined':
                    this.handlePlayerJoined(message);
                    break;
                case 'players_moved':
                    this.handlePlayersMoved(message);
                    break;
                case 'player_left':
                    this.handlePlayerLeft(message);
                    break;
                default:
                    console.log('Unknown message type:', message.action);
            }
        } catch (error) {
            console.error('Error parsing server message:', error);
        }
    }
    
    handleJoinGameResponse(message) {
        if (message.success) {
            this.myPlayerId = message.playerId;
            
            // Store all players
            Object.values(message.players).forEach(player => {
                this.players.set(player.id, player);
            });
            
            // Store all avatars
            Object.values(message.avatars).forEach(avatar => {
                this.avatars.set(avatar.name, avatar);
            });
            
            console.log('Successfully joined game as:', message.playerId);
            console.log('Current players:', this.players.size);
            console.log('Available avatars:', this.avatars.size);
            
            // Redraw to show the player
            this.draw();
        } else {
            console.error('Failed to join game:', message.error);
        }
    }
    
    handlePlayerJoined(message) {
        this.players.set(message.player.id, message.player);
        this.avatars.set(message.avatar.name, message.avatar);
        console.log('Player joined:', message.player.username);
        this.draw();
    }
    
    handlePlayersMoved(message) {
        Object.values(message.players).forEach(player => {
            this.players.set(player.id, player);
        });
        this.draw();
    }
    
    handlePlayerLeft(message) {
        this.players.delete(message.playerId);
        console.log('Player left:', message.playerId);
        this.draw();
    }
    
    setupEventListeners() {
        // Add click event for future click-to-move functionality
        this.canvas.addEventListener('click', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Convert screen coordinates to world coordinates
            const worldX = Math.floor(x + this.viewportX);
            const worldY = Math.floor(y + this.viewportY);
            
            console.log(`Clicked at world coordinates: (${worldX}, ${worldY})`);
        });
        
        // Add keyboard event listeners for movement
        document.addEventListener('keydown', (event) => {
            this.handleKeyPress(event);
        });
    }
    
    handleKeyPress(event) {
        // Prevent default behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }
        
        // Map arrow keys to directions
        const directionMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down', 
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        const direction = directionMap[event.code];
        if (direction && this.connected) {
            this.sendMoveCommand(direction);
        }
    }
    
    sendMoveCommand(direction) {
        if (!this.connected) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.socket.send(JSON.stringify(moveMessage));
        console.log('Sent move command:', direction);
    }
    
    sendStopCommand() {
        if (!this.connected) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.socket.send(JSON.stringify(stopMessage));
        console.log('Sent stop command');
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});

