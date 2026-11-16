# ClueSimpsons Online

Backend independiente para salas de juego multijugador. No modifica la lógica del anotador convencional.

## Componentes

- Cloudflare Worker: API HTTP y entrada WebSocket.
- Durable Object \`GameRoom\`: un objeto SQLite por sala, con estado consistente.
- WebSocket Hibernation API: sincronización de los estados públicos de la sala.
- Los tokens de organizador y jugador se guardan como hashes SHA-256.
- Las conexiones WebSocket usan tickets de un solo uso, con vencimiento de 60 segundos.

## Etapa inicial

Incluye creación de sala, ingreso por código, elección de asiento, cambio de asientos por el organizador (intercambia posiciones si están ocupadas), selección manual o aleatoria de primer jugador e inicio de sala.

El estado público no contiene cartas ni datos privados. El motor de suposiciones y el ingreso de cartas se incorporarán en una etapa posterior, integrándose con el anotador existente.

## Desarrollo y despliegue

Desde esta carpeta:

\`\`\`sh
npx wrangler deploy --config wrangler.jsonc
\`\`\`

El Worker esperado es \`https://cluesimpsons-online.jappstore.workers.dev\`.

La URL de la API se declara en \`js/online.js\` del frontend. Para pruebas locales se pueden agregar orígenes explícitos a \`ALLOWED_ORIGINS\` en \`worker.js\`.

## Estado

Etapa 1: salas y turnos iniciales. La partida permanece en lobby hasta que el organizador la inicia. En esta etapa el indicador muestra quién comienza y el siguiente asiento; el avance de turnos se conectará a las suposiciones digitales en la etapa de juego, no mediante botones manuales.
