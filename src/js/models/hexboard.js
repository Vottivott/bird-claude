import * as store from '../store.js';
import { createRNG, randomInt, randomChoice } from '../utils/random.js';

export function generateBoard() {
  const boardSeed = Date.now();
  const rng = createRNG(boardSeed);
  const hexes = [];
  let nextId = 0;

  const startHex = {
    id: nextId++,
    q: 0, r: 0,
    type: 'start',
    content: null,
    revealed: true,
    connections: [],
  };
  hexes.push(startHex);

  let prevIds = [startHex.id];
  let currentQ = 0;
  let shopCounter = randomInt(rng, 12, 20);
  let soilCounter = randomInt(rng, 8, 15);

  for (let step = 1; step <= 50; step++) {
    currentQ++;
    const isBranch = rng() < 0.25 && step > 2 && step < 48;

    let type = 'normal';
    shopCounter--;
    soilCounter--;
    if (shopCounter <= 0) {
      type = 'shop';
      shopCounter = randomInt(rng, 15, 25);
    } else if (soilCounter <= 0) {
      type = 'soil';
      soilCounter = randomInt(rng, 10, 20);
    }

    if (isBranch) {
      const hexA = {
        id: nextId++,
        q: currentQ, r: -1,
        type,
        content: null,
        revealed: false,
        connections: [],
      };

      let type2 = 'normal';
      if (type !== 'shop' && shopCounter <= 2) {
        type2 = 'shop';
        shopCounter = randomInt(rng, 15, 25);
      } else if (type !== 'soil' && soilCounter <= 2) {
        type2 = 'soil';
        soilCounter = randomInt(rng, 10, 20);
      }

      const hexB = {
        id: nextId++,
        q: currentQ, r: 1,
        type: type2,
        content: null,
        revealed: false,
        connections: [],
      };

      hexes.push(hexA, hexB);
      for (const pid of prevIds) {
        const prev = hexes.find(h => h.id === pid);
        prev.connections.push(hexA.id, hexB.id);
      }

      // Merge point
      currentQ++;
      step++;
      const mergeType = 'normal';
      const mergeHex = {
        id: nextId++,
        q: currentQ, r: 0,
        type: mergeType,
        content: null,
        revealed: false,
        connections: [],
      };
      hexes.push(mergeHex);
      hexA.connections.push(mergeHex.id);
      hexB.connections.push(mergeHex.id);
      prevIds = [mergeHex.id];
    } else {
      const r = rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0;
      const hex = {
        id: nextId++,
        q: currentQ, r,
        type,
        content: null,
        revealed: false,
        connections: [],
      };
      hexes.push(hex);
      for (const pid of prevIds) {
        const prev = hexes.find(h => h.id === pid);
        prev.connections.push(hex.id);
      }
      prevIds = [hex.id];
    }
  }

  const board = {
    boardSeed,
    hexes,
    playerPosition: 0,
    pendingSteps: 0,
    totalHexesVisited: 1,
  };

  store.setHexBoard(board);
  return board;
}

function revealHexOnBoard(board, hexId) {
  const hex = board.hexes.find(h => h.id === hexId);
  if (!hex || hex.revealed) return null;

  const rng = createRNG(board.boardSeed + hexId * 7919);

  if (hex.type === 'normal' || hex.type === 'start') {
    const seeds = randomInt(rng, 1, 3);
    let sticks = 0;
    if (rng() < 0.33) {
      sticks = rng() < 0.67 ? 1 : randomInt(rng, 3, 5);
    }
    hex.content = { seeds, sticks };
  } else if (hex.type === 'shop' || hex.type === 'soil') {
    const seeds = randomInt(rng, 1, 2);
    hex.content = { seeds, sticks: 0 };
  }

  hex.revealed = true;
  return hex.content;
}

export function revealHex(hexId) {
  const board = store.getHexBoard();
  const content = revealHexOnBoard(board, hexId);
  if (content !== null) store.setHexBoard(board);
  return content;
}

export function movePlayer(targetHexId) {
  const board = store.getHexBoard();
  const currentHex = board.hexes.find(h => h.id === board.playerPosition);

  if (!currentHex.connections.includes(targetHexId)) return null;
  if (board.pendingSteps <= 0) return null;

  board.playerPosition = targetHexId;
  board.pendingSteps--;
  board.totalHexesVisited++;

  const content = revealHexOnBoard(board, targetHexId);

  if (content) {
    if (content.seeds > 0) store.addSeeds(content.seeds, 'hex_seeds');
    if (content.sticks > 0) store.addSticks(content.sticks, 'hex_sticks');
  }

  store.setHexBoard(board);
  return { hex: board.hexes.find(h => h.id === targetHexId), content };
}

export function addSteps(count) {
  let board = store.getHexBoard();
  if (!board) board = generateBoard();
  board.pendingSteps += count;
  store.setHexBoard(board);
  return board;
}

export function getBoard() {
  let board = store.getHexBoard();
  if (!board) board = generateBoard();
  return board;
}

export function getConnectedHexes(hexId) {
  const board = store.getHexBoard();
  const hex = board.hexes.find(h => h.id === hexId);
  if (!hex) return [];
  return hex.connections.map(id => board.hexes.find(h => h.id === id)).filter(Boolean);
}
