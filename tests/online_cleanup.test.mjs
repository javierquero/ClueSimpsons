// Pruebas de la limpieza de salas abandonadas. Ejecutar desde la raíz del repo.
// Terminal 1 (plazos cortos solo en el Worker local):
//   cd online && npx wrangler dev --config wrangler.jsonc --port 8787 --local --var CLEANUP_TTL_OVERRIDE_MS:3000
// Terminal 2:
//   node --test tests/online_cleanup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.ONLINE_BASE || 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

const createRoom = async () => (await api('/api/rooms', { method: 'POST', body: { hostName: 'Organizador' } })).data;
const exists = async code => (await api(`/api/rooms/${code}`)).status === 200;

async function openHostSocket(code, hostToken) {
  const { data } = await api(`/api/rooms/${code}/socket-ticket`, { method: 'POST', token: hostToken });
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws?ticket=${data.ticket}`);
    const state = { ws, closedAt: null };
    ws.addEventListener('close', () => { state.closedAt = Date.now(); });
    ws.addEventListener('open', () => resolve(state));
    ws.addEventListener('error', () => reject(new Error('no se pudo abrir el WebSocket')));
  });
}

test('una sala inactiva y sin conexiones se borra sola', { timeout: 30000 }, async () => {
  const { code } = await createRoom();
  assert.equal(await exists(code), true);
  await sleep(6000);
  assert.equal(await exists(code), false, 'la sala debería haberse eliminado');
});

test('la actividad reinicia el plazo de abandono', { timeout: 30000 }, async () => {
  const { code } = await createRoom();
  await sleep(2000);
  const joined = await api(`/api/rooms/${code}/join`, { method: 'POST', body: { name: 'Ana' } });
  assert.equal(joined.status, 201);
  await sleep(2500); // 4,5 s desde la creación: sin actividad habría vencido a los 3 s
  assert.equal(await exists(code), true, 'la actividad reciente la mantiene viva');
  await sleep(4000);
  assert.equal(await exists(code), false, 'sin más actividad, se elimina');
});

test('un WebSocket abierto mantiene la sala; al cerrarse vuelve a correr el plazo', { timeout: 40000 }, async () => {
  const { code, hostToken } = await createRoom();
  const socket = await openHostSocket(code, hostToken);
  await sleep(5500); // supera el plazo de inactividad, pero hay una conexión abierta
  assert.equal(await exists(code), true, 'con una conexión abierta no se considera abandonada');
  socket.ws.close();
  await sleep(1500);
  assert.equal(await exists(code), true, 'recién se desconectó: el plazo empieza ahora');
  await sleep(7000);
  assert.equal(await exists(code), false, 'sin conexiones ni actividad, se elimina');
});

test('el tope de edad elimina la sala aunque haya una conexión abierta y cierra el socket', { timeout: 40000 }, async () => {
  const { code, hostToken } = await createRoom();
  const socket = await openHostSocket(code, hostToken);
  const started = Date.now();
  // El cliente de Node tarda en emitir "close"; alcanza con ver que el servidor inició el cierre.
  while (socket.ws.readyState === WebSocket.OPEN && Date.now() - started < 15000) await sleep(250);
  assert.notEqual(socket.ws.readyState, WebSocket.OPEN, 'el servidor debería cerrar el socket al eliminar la sala');
  assert.equal(await exists(code), false);
});

test('una sala eliminada responde 404 a quien intente unirse o consultarla', { timeout: 30000 }, async () => {
  const { code, hostToken } = await createRoom();
  await sleep(6000);
  const stale = await api(`/api/rooms/${code}/join`, { method: 'POST', body: { name: 'Tarde' } });
  assert.equal(stale.status, 404);
  const staleHost = await api(`/api/rooms/${code}`, { token: hostToken });
  assert.ok([401, 404].includes(staleHost.status));
});
