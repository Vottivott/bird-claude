import * as store from '../store.js';
import { createRNG, randomInt, randomChoice } from '../utils/random.js';

function pickShopTier(rng) {
  const r = rng();
  if (r < 0.15) return 2;
  if (r < 0.40) return 1;
  return 0;
}

function extendBoard(board, count) {
  const rng = createRNG(board.boardSeed + board.hexes.length * 1013);
  let nextId = board.hexes.length;

  const lastHexes = board.hexes.filter(h => h.connections.length === 0);
  let prevIds = lastHexes.length > 0 ? lastHexes.map(h => h.id) : [board.hexes[board.hexes.length - 1].id];

  const maxQ = Math.max(...board.hexes.map(h => h.q));
  let currentQ = maxQ;

  let shopCounter = board._shopCounter || randomInt(rng, 2, 6);
  let soilCounter = board._soilCounter || randomInt(rng, 2, 7);
  let chestCounter = board._chestCounter || randomInt(rng, 10, 20);

  for (let step = 0; step < count; step++) {
    currentQ++;
    const prevHexForBranch = board.hexes.find(h => h.id === prevIds[0]);
    const isBranch = rng() < 0.35 && step > 1 && step < count - 2;

    let type = 'normal';
    shopCounter--;
    soilCounter--;
    chestCounter--;
    if (chestCounter <= 0) {
      type = 'chest';
      chestCounter = randomInt(rng, 10, 20);
    } else if (shopCounter <= 0) {
      type = 'shop';
      shopCounter = randomInt(rng, 2, 6);
    } else if (soilCounter <= 0) {
      type = 'soil';
      soilCounter = randomInt(rng, 2, 7);
    } else if (rng() < 0.4) {
      type = 'flowers';
    }

    if (isBranch) {
      const baseR = prevHexForBranch ? prevHexForBranch.r : 0;
      const rA = baseR;
      const rB = baseR - 1;
      const hexA = {
        id: nextId++,
        q: currentQ, r: rA,
        type,
        shopTier: type === 'shop' ? pickShopTier(rng) : undefined,
        content: null,
        revealed: false,
        connections: [],
      };

      let type2 = 'normal';
      if (type !== 'shop' && shopCounter <= 2) {
        type2 = 'shop';
        shopCounter = randomInt(rng, 2, 6);
      } else if (type !== 'soil' && soilCounter <= 2) {
        type2 = 'soil';
        soilCounter = randomInt(rng, 2, 7);
      }

      const hexB = {
        id: nextId++,
        q: currentQ, r: rB,
        type: type2,
        shopTier: type2 === 'shop' ? pickShopTier(rng) : undefined,
        content: null,
        revealed: false,
        connections: [],
      };

      board.hexes.push(hexA, hexB);
      for (const pid of prevIds) {
        const prev = board.hexes.find(h => h.id === pid);
        prev.connections.push(hexA.id, hexB.id);
      }

      currentQ++;
      step++;
      const mergeHex = {
        id: nextId++,
        q: currentQ, r: baseR - 1,
        type: 'normal',
        content: null,
        revealed: false,
        connections: [],
      };
      board.hexes.push(mergeHex);
      hexA.connections.push(mergeHex.id);
      hexB.connections.push(mergeHex.id);
      prevIds = [mergeHex.id];
    } else {
      const prevHex = board.hexes.find(h => h.id === prevIds[0]);
      const prevR = prevHex ? prevHex.r : 0;
      const r = rng() < 0.2 ? prevR - 1 : prevR;
      const hex = {
        id: nextId++,
        q: currentQ, r,
        type,
        shopTier: type === 'shop' ? pickShopTier(rng) : undefined,
        content: null,
        revealed: false,
        connections: [],
      };
      board.hexes.push(hex);
      for (const pid of prevIds) {
        const prev = board.hexes.find(h => h.id === pid);
        prev.connections.push(hex.id);
      }
      prevIds = [hex.id];
    }
  }

  board._shopCounter = shopCounter;
  board._soilCounter = soilCounter;
  board._chestCounter = chestCounter;
}

export function generateBoard() {
  const boardSeed = Date.now();
  const board = {
    boardSeed,
    hexes: [],
    playerPosition: 0,
    pendingSteps: 0,
    totalHexesVisited: 1,
  };

  const rng = createRNG(boardSeed);
  const startHex = {
    id: 0,
    q: 0, r: 0,
    type: 'start',
    content: null,
    revealed: true,
    connections: [],
  };
  board.hexes.push(startHex);
  board._shopCounter = randomInt(rng, 1, 2);
  board._soilCounter = randomInt(rng, 3, 4);
  board._chestCounter = randomInt(rng, 10, 15);

  extendBoard(board, 50);

  store.setHexBoard(board);
  return board;
}

function ensureBoardExtended(board) {
  const currentHex = board.hexes.find(h => h.id === board.playerPosition);
  if (!currentHex) return;

  const maxQ = Math.max(...board.hexes.map(h => h.q));
  const remainingQ = maxQ - currentHex.q;
  if (remainingQ < 10) {
    extendBoard(board, 30);
  }
}

function revealHexOnBoard(board, hexId) {
  const hex = board.hexes.find(h => h.id === hexId);
  if (!hex || hex.revealed) return null;

  const rng = createRNG(board.boardSeed + hexId * 7919);

  if (hex.type === 'normal' || hex.type === 'start' || hex.type === 'wizened') {
    const seeds = randomInt(rng, 1, 3);
    let sticks = 0;
    if (rng() < 0.33) {
      sticks = rng() < 0.67 ? 1 : randomInt(rng, 3, 5);
    }
    hex.content = { seeds, sticks };
  } else if (hex.type === 'flowers') {
    const seeds = randomInt(rng, 5, 10);
    let sticks = 0;
    if (rng() < 0.33) {
      sticks = rng() < 0.67 ? 1 : randomInt(rng, 3, 5);
    }
    hex.content = { seeds, sticks };
  } else if (hex.type === 'chest') {
    const seeds = randomInt(rng, 2, 20) * 10;
    hex.content = { seeds, sticks: 0, chest: true };
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

  ensureBoardExtended(board);
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
