const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const readline = require('readline');

const address = "0.0.0.0";
const port = 6969;

const players = new Map();
let nextPlayerId = 0;

const WIDTH = 1200;
const HEIGHT = 800;

const CELL_SIZE = 20;
const mapWidth = 100;
const mapHeight = 100;

const foods = [];

const game = {
  paused: false
}

const chatHistory = [];
let messageCounter = 0;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("[ADMIN] Console ready. Type 'help' to list commands.");

function eatFood(x, y) {
  const foodIndex = foods.findIndex(
    (food) => food.x === x && food.y === y
  );

  if (foodIndex !== -1) {
    // Remove the eaten food
    foods.splice(foodIndex, 1);

    // Spawn a new food
    const newFood = {
      x: Math.floor(Math.random() * mapWidth),
      y: Math.floor(Math.random() * mapHeight)
    };

    foods.push(newFood);

    // Create updated food packet
    const foodPacket = JSON.stringify({
      type: "food",
      foods: foods,
    });

    broadcast(foodPacket);
  }
}

server.on("message", (msg, rinfo) => {
  const senderKey = `${rinfo.address}:${rinfo.port}`;

  try {
    const data = JSON.parse(msg.toString());

    //console.log(`Recieved: ${JSON.stringify(data)} from ${senderKey}`)

    if (data.type === "connect") {
      if(players.has(senderKey)) {
        return;
      }
      const playerId = nextPlayerId++;
      const initialSnake = [];
      const spawnPosition = {
        x: Math.floor(Math.random() * mapWidth),
        y: Math.floor(Math.random() * mapHeight)
      };  
      initialSnake.push({ x: spawnPosition.x, y: spawnPosition.y });
      players.set(senderKey, {
        id: playerId,
        name: data.name,
        color: data.color,
        snake: initialSnake,
        alive: false, // Ensure initial state is alive
        direction: data.direction,
        speed: data.speed,
        lastUpdateTime: 0 // Initialize last update time
      });

      // Send initial food list to player
      const foodPacket = JSON.stringify({
        type: "food",
        foods: foods,
      });

      const playerIdPacket = JSON.stringify({ type: "playerId", id: playerId });
      const playerSpawnData = JSON.stringify({ type: "spawnData", name: data.name, color: data.color, snake: data.snake, direction: data.direction, speed: data.speed });
      server.send(playerSpawnData, rinfo.port, rinfo.address);
      server.send(playerIdPacket, rinfo.port, rinfo.address);
      server.send(foodPacket, rinfo.port, rinfo.address);

      console.log(`[CONNECT] ${senderKey} connected`);
    }
    if(data.type === "disconnect") {
      const player = players.get(senderKey);
      if (player) {
        const disconnectData = JSON.stringify({ 
          type: "disconnect", 
          id: player.id, 
          name: player.name, 
          color: player.color 
        });
        broadcast(disconnectData);
        console.log(`[DISCONNECT] ${senderKey} disconnected`);
        players.delete(senderKey);
      }
    }    
    if(data.type === "spawn") {
      const initialSnake = [];
      const spawnPosition = {
        x: Math.floor(Math.random() * mapWidth),
        y: Math.floor(Math.random() * mapHeight)
      };  
      initialSnake.push({ x: spawnPosition.x, y: spawnPosition.y });
      players.set(senderKey, {
        id: data.id,
        name: data.name,
        color: data.color,
        snake: initialSnake,
        alive: true,
        direction: data.direction,
        speed: data.speed,
        lastUpdateTime: 0
      });
    }
    if (data.type === "eatFood") {
      const foodIndex = foods.findIndex(
        (food) => food.x === data.position.x && food.y === data.position.y
      );

      if (foodIndex !== -1) {
        // Remove the eaten food
        foods.splice(foodIndex, 1);

        // Spawn a new food
        const newFood = {
          x: Math.floor(Math.random() * mapWidth),
          y: Math.floor(Math.random() * mapHeight)
        };

        foods.push(newFood);

        // Create updated food packet
        const foodPacket = JSON.stringify({
          type: "food",
          foods: foods,
        });

        broadcast(foodPacket);

        console.log(`[LOG] Food eaten at (${data.position.x}, ${data.position.y}), new food at (${newFood.x}, ${newFood.y})`);
      }
    }
    if (data.type === "changeDirection") {
      const player = players.get(senderKey);
      if (player) {
        player.direction = data.direction;
        players.set(senderKey, player);
      }
    }

    if(data.type === "ping") {
      const pingPacket = JSON.stringify({ type: "ping" });
      server.send(pingPacket, rinfo.port, rinfo.address);
    }

    if(data.type === "chat") {
      const playerId = data.playerId;
      const playerName = data.playerName;
      const message = data.message;

      players.forEach((player, key) => {
        if(player.id != playerId) return;

        // generate a message id    
        const messageId = `msg_${messageCounter++}`;

        chatHistory.push({
          messageId: messageId,
          playerId: player.id,
          playerName: player.name,
          message: message,
          timestamp: Date.now() // optional, for sorting or timestamps
        });
        if(chatHistory > 100) {
          chatHistory.shift();
        } 
        const chatPacket = JSON.stringify({ type: "chat", chatHistory })
        broadcast(chatPacket)
      })
    }
  } catch (err) {
    console.error("Failed to parse message:", msg.toString());
    console.error(err);
  }
});

function broadcast(message) {
  for (const [key, _] of players) {
    const [ip, port] = key.split(":");
    server.send(message, 0, message.length, parseInt(port), ip);
  }
}

server.bind(port, address, () => {
  console.log(`running at ${address}:${port}`);
  for (let i = 0; i < 20; i++) {
    foods.push({ x: Math.floor(Math.random() * mapWidth), y: Math.floor(Math.random() * mapHeight) });
  }
  setInterval(() => {
    const currentTime = Date.now() / 1000; // Convert to seconds
    
    const playerList = [];
    players.forEach((player, key) => {
      const playerId = player.id;

      playerList.push({[playerId]: {
        id: player.id,
        name: player.name,
        color: player.color,
        snake: player.snake,
        alive: player.alive,
        direction: player.direction,
        speed: player.speed
      }})
    })
    
    const packet = JSON.stringify({ type: "players", playerList });
    broadcast(packet);

    players.forEach((player, key) => {
      // Implement speed control similar to the C++ code

      if (currentTime - player.lastUpdateTime < player.speed) {
        return;
      }
      player.lastUpdateTime = currentTime;

      if (!player.alive) return;

      const snake = player.snake;
      const head = { x: snake[0].x, y: snake[0].y };

      if(!game.paused) {
        switch (player.direction) {
          case 0: head.y--; break;
          case 1: head.y++; break;
          case 2: head.x--; break;
          case 3: head.x++; break;
        }
      }

      // Check border collision
      if (head.x < 0 || head.y < 0 || head.x >= mapWidth || head.y >= mapHeight) {
        player.alive = false;
        const deathPacket = JSON.stringify({ type: "deathEvent", playerId: player.id, playerName: player.name });
        broadcast(deathPacket)
        return;
      }

      // Check self collision
      for(let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
          player.alive = false;
          const deathPacket = JSON.stringify({ type: "deathEvent", playerId: player.id, playerName: player.name });
          broadcast(deathPacket)
          return;
        }
      }

      // check player colission
      players.forEach((otherPlayer, otherKey) => {
        if (otherPlayer.id === player.id) return;
        if(!otherPlayer.alive) return;
        const otherSnake = otherPlayer.snake;
        for (let i = 0; i < otherSnake.length; i++) {
          if (otherSnake[i].x === head.x && otherSnake[i].y === head.y) {
            player.alive = false;
            const deathPacket = JSON.stringify({ type: "deathEvent", playerId: player.id, playerName: player.name });
            broadcast(deathPacket)
            for (let i = 0; i < player.snake.length; i++) {
              otherSnake.push(player.snake[i]);
            }
            return;
          }
        }
      })

      // Update snake
      snake.unshift({ x: head.x, y: head.y });

      // Check food collision
      let ateFood = false;
      for (let i = 0; i < foods.length; ++i) {
        if (head.x == foods[i].x && head.y == foods[i].y) {
          eatFood(head.x, head.y);
          ateFood = true;
          player.speed -= 0.001;
          const fP = JSON.stringify({ type: "eatEvent", playerId: player.id, playerName: player.name, x: head.x, y: head.y });
          broadcast(fP);
          break;
        }
      }
      if (!ateFood && snake.length > 1) {
        snake.pop();
      }

      player.snake = snake;
      players.set(key, player)
    });
  }, 100);
});


rl.on('line', (input) => {
  const args = input.trim().split(' ');
  const command = args[0];

  switch (command) {
    case 'list':
      console.log(`Connected Players (${players.size}/12):`);
      players.forEach((p, key) => {
        console.log(`- ID ${p.id}, Name: ${p.name}, Alive: ${p.alive}, Addr: ${key}`);
      });
      break;

    case 'kick':
      const idToKick = parseInt(args[1]);
      const entry = [...players.entries()].find(([_, p]) => p.id === idToKick);
      if (entry) {
        const [key, _] = entry;
        players.delete(key);
        console.log(`[ADMIN] Kicked player with ID ${idToKick}`);
      } else {
        console.log(`[ADMIN] No player found with ID ${idToKick}`);
      }
    break;

    case 'grow':
      const growId = parseInt(args[1]);
      const playerToGrow = findPlayerById(growId);

      if(args.length == 3) {
        const growAmount = parseInt(args[2]);

        if(!playerToGrow) {
          console.log(`[ADMIN] No player found with ID ${growId}`);
        }

        for(let i = 0; i < growAmount; i++) {
          const snake = playerToGrow.snake;
          const head = { x: snake[0].x, y: snake[0].y };
          snake.unshift({ x: head.x, y: head.y })
        }
        console.log(`[ADMIN] Grown player with ID ${growId} ${growAmount} times`);
      }

      if(args.length == 2) {
        if(playerToGrow) {
          const snake = playerToGrow.snake;
          const head = { x: snake[0].x, y: snake[0].y };
          snake.unshift({ x: head.x, y: head.y })
          console.log(`[ADMIN] Grown player with ID ${growId}`);
        } else {
          console.log(`[ADMIN] No player found with ID ${growId}`);
        }
      }
    break;

    case 'shrink':
      const shrinkId = parseInt(args[1]);
      const playerToShrink = findPlayerById(shrinkId);
      if(args.length == 3) {
        const shrinkAmount = parseInt(args[2]);

        if(!playerToShrink) {
          console.log(`[ADMIN] No player found with ID ${shrinkId}`);
          return;
        }

        if(playerToShrink.snake.length <= 1) {
          console.log(`[ADMIN] Cannot shrink player with ID ${shrinkId} because he would die`);
          return;
        }

        for(let i = 0; i < shrinkAmount; i++) {
          const snake = playerToShrink.snake;
          snake.pop();
        }
        console.log(`[ADMIN] Shrinked player with ID ${shrinkId} ${shrinkAmount} times`);
      }

      if(args.length == 2) {
        if(playerToShrink) {
          const snake = playerToShrink.snake;
          if(playerToShrink.snake.length <= 1) {
            console.log(`[ADMIN] Cannot shrink player with ID ${shrinkId} because he would die`);
            return;
          }
          snake.pop();
          console.log(`[ADMIN] Shrinked player with ID ${shrinkId}`);
        } else {
          console.log(`[ADMIN] No player found with ID ${shrinkId}`);
        }
      }
    break;

    case 'kill':
      const killId = parseInt(args[1]);
      const playerToKill = findPlayerById(killId);

      if(playerToKill) {
        playerToKill.alive = false;
        console.log(`[ADMIN] Killed player with ID ${killId}`);
      } else {
        console.log(`[ADMIN] No player found with ID ${killId}`);
      }
    break;

    case 'food':
      const x = Math.floor(Math.random() * mapWidth);
      const y = Math.floor(Math.random() * mapHeight);
      foods.push({ x, y });
      broadcast(JSON.stringify({ type: "food", foods }));
      console.log(`[ADMIN] Spawned food at (${x}, ${y})`);
      break;

    case 'clear':
      console.clear();
      break;

    case 'help':
      console.log(`Commands:
  list               - List connected players
  kick [id]          - Kick player by ID
  kill [id]          - Kill player by ID
  food               - Spawn food
  grow [id]          - Grow the player
  shrink [id]        - Shrink the player
  clear              - Clear the console
  help               - Show commands
  exit               - Quit the server
      `);
      break;

      case 'pause':
        game.paused = !game.paused;
        console.log(`Game paused: ${game.paused ? "Yes" : "No"}`);
      break;

    case 'exit':
      console.log("[ADMIN] Shutting down server...");
      server.close();
      rl.close();
      process.exit(0);
      break;

    default:
      console.log(`[ADMIN] Unknown command: ${command}. Type 'help' for options.`);
      break;
  }
});

function findPlayerById(id) {
  let player;

  players.forEach((p, key) => {
    if (p.id === id) {
      player = p;
    }
  });

  return player;
}