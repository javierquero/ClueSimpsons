// Historial de las últimas 5 suposiciones y carta mostrada del que supone.
// Ejecutar desde la raíz del repo en dos terminales.
// Terminal 1:
//   cd online && npx wrangler dev --config wrangler.jsonc --port 8787 --local
// Terminal 2:
//   node --test tests/online_history.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.ONLINE_BASE || 'http://127.0.0.1:8787';
const S = ["Coronel Mostaza","Profesor Moradillo","Sr. Verdi","Sra. Azulino","Srita. Escarlata","Sra. Blanco"];
const W = ["Collar","Barra de Plutonio","Honda","Saxofón","Guante extensible","Dona envenenada"];
const P = ["Asilo Springfield","Bolerama","El Calabozo del Androide","Casa de los Simpsons","Estudios Krustylu","El Holandés Frito","Kwik-E-Mart","Mansión Burns","Planta Nuclear"];

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// Solución: S[0], W[0], P[0]. Reparto de las 18 restantes entre 3 jugadores.
async function startGame() {
  const { data: room } = await api('/api/rooms', { method: 'POST', body: { hostName: 'Org' } });
  const { code, hostToken } = room;
  const players = [];
  for (const name of ['Ana', 'Beto', 'Caro']) {
    const j = await api(`/api/rooms/${code}/join`, { method: 'POST', body: { name } });
    assert.equal(j.status, 201);
    players.push({ name, id: j.data.playerId, token: j.data.playerToken });
  }
  const rest = [...S.slice(1), ...W.slice(1), ...P.slice(1)];
  for (let i = 0; i < 3; i++) {
    const h = await api(`/api/rooms/${code}/hand`, { method: 'POST', token: players[i].token, body: { cards: rest.slice(i * 6, i * 6 + 6) } });
    assert.equal(h.status, 200, JSON.stringify(h.data));
    players[i].hand = rest.slice(i * 6, i * 6 + 6);
  }
  const st = await api(`/api/rooms/${code}/start`, { method: 'POST', token: hostToken, body: { firstPlayerId: players[0].id } });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  return { code, hostToken, players };
}

const view = async (code, p) => { const d = (await api(`/api/rooms/${code}`, { token: p.token })).data; return d.room ?? d; };

// Juega una ronda: el jugador del turno supone cartas que tiene Caro (índice 2, última en responder si empieza Ana/Beto)
async function playRound(code, players, cards) {
  const v = await view(code, players[0]);
  const turn = players.find(p => p.id === v.turnPlayerId);
  const s = await api(`/api/rooms/${code}/suggestions`, { method: 'POST', token: turn.token, body: { suspect: cards[0], weapon: cards[1], place: cards[2] } });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  let sug = s.data.room.suggestion;
  while (!sug.completed) {
    const responder = players.find(p => p.id === sug.currentResponderId);
    const own = sug.cards.find(c => responder.hand.includes(c));
    const r = await api(`/api/rooms/${code}/responses`, { method: 'POST', token: responder.token, body: { card: own || 'none' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    sug = r.data.room.suggestion;
  }
  return { turn, id: sug.id };
}

test('se conservan solo las últimas 5 suposiciones y el que supone conserva la carta de cada una', { timeout: 60000 }, async () => {
  const { code, players } = await startGame();
  const rounds = [];
  for (let i = 0; i < 7; i++) {
    // cartas de la mano de Caro: siempre habrá alguien que muestre
    rounds.push(await playRound(code, players, [S[1 + (i % 5)], W[1 + (i % 5)], P[1 + (i % 8)]]));
  }
  const last5 = rounds.slice(-5);
  for (const p of players) {
    const v = await view(code, p);
    assert.equal(v.suggestionHistory.length, 5);
    assert.deepEqual(v.suggestionHistory.map(h => h.id), last5.map(r => r.id));
    assert.ok(v.suggestionHistory.every(h => !('shownCard' in h)), 'el historial público no filtra la carta');
    const shown = v.private?.shownCards || {};
    for (const h of v.suggestionHistory) {
      const mine = h.byPlayerId === p.id && h.outcome === 'shown';
      assert.equal(h.id in shown, mine, 'solo el que supuso ve la carta de sus suposiciones');
      if (mine) assert.ok(shown[h.id].card);
    }
  }
});
