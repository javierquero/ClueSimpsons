# ClueSimpsons Online

Backend independiente para partidas multijugador. El anotador convencional conserva su lógica y su funcionamiento offline; el modo online coordina la partida y reutiliza el registro de suposiciones del anotador v72.

## Arquitectura

- Cloudflare Worker: API HTTP y entrada WebSocket.
- Durable Object `GameRoom`: un objeto por código de sala, con estado persistente y serialización de las mutaciones.
- WebSockets: sincronizan la mesa, el turno y el avance de cada suposición.
- Tokens aleatorios para organizador y jugadores; en el almacenamiento solo se conserva su hash SHA-256.
- Tickets WebSocket de un solo uso, con vencimiento de 60 segundos.

## Mecánica implementada

- Crear sala e ingresar mediante código de seis dígitos.
- El organizador puede jugar o limitarse a administrar la sala.
- El servidor asigna el primer asiento libre al unirse; el organizador puede cambiar los asientos e intercambiar posiciones mientras la partida siga en lobby. Las columnas del anotador se reordenan por ID de jugador para conservar las marcas locales al cambiar los asientos.
- La primera carga de cartas cierra el ingreso de nuevos participantes, pero no bloquea los cambios de asiento del organizador.
- Cada jugador carga sus propias cartas. El servidor valida que sean cartas válidas, que no se repitan y que la distribución completa contenga las 18 cartas de jugador, dejando una carta por categoría en la solución.
- El organizador elige quién comienza o solicita un sorteo aleatorio.
- Las suposiciones se consultan en orden de mesa. Cada jugador debe elegir una carta coincidente o confirmar expresamente que no tiene ninguna; nunca se responde automáticamente.
- Todos ven quién supone, quién responde y si mostró una carta. La identidad de la carta se entrega únicamente al jugador que hizo la suposición.
- Las respuestas completadas se incorporan al anotador local reutilizando `saveGuess()` y el marcado automático ya existente en `js/app.js?v=72`.
- Acusación final: el resultado incorrecto es privado para quien acusa; ese jugador pierde la posibilidad de ganar, pero continúa respondiendo a los demás.
- El organizador puede pausar y reanudar la partida; la sesión se conserva para volver a conectarse.

## Privacidad

El snapshot público no incluye manos ni la identidad de la carta mostrada. La mano, las cartas coincidentes del respondedor, el resultado de una acusación incorrecta y la carta mostrada se entregan solo al jugador autenticado correspondiente. Cuando una suposición se responde con una carta, los demás reciben únicamente el estado “mostró una carta”.

Las notificaciones del navegador requieren permiso y una página conectada para procesar los cambios. La entrega push cuando el navegador está completamente cerrado no forma parte de esta etapa.

## Desarrollo y despliegue

Desde esta carpeta:

```sh
npx wrangler deploy --config wrangler.jsonc
```

Worker publicado: `https://cluesimpsons-online.jappstore.workers.dev`.

La URL de API está declarada en `js/online.js`. Para pruebas locales, agregá explícitamente los orígenes de desarrollo a `ALLOWED_ORIGINS` en `worker.js`.

Comprobación de servicio: `GET /health`.

## Límite entre modos

El módulo online mantiene su propia sesión y una copia local del anotador por jugador. Al salir del panel de una partida se restaura el estado convencional. El archivo `js/app.js` no se modifica para incorporar el modo online; la capa de integración utiliza sus funciones públicas existentes.

## Limpieza de salas abandonadas

- Una sala se elimina sola (alarma del Durable Object) cuando no tiene ningún WebSocket abierto y pasó su plazo sin actividad: 12 h en lobby, 12 h en juego y 3 h terminada. Cualquier cambio guardado (unirse, cargar cartas, suponer, responder, conectarse o desconectarse) reinicia el plazo.
- Tope absoluto: 24 h desde la creación, aunque haya conexiones abiertas. Al vencer se cierran los sockets (código 1001) y se borra todo el estado.
- Con conexiones abiertas se revisa cada hora.

## Historial de suposiciones

- La sala conserva las últimas 5 suposiciones completadas (`suggestionHistory`, sin la carta mostrada).
- Quien supuso recibe en `private.shownCards[id]` la carta que le mostraron en cada una; así, si estaba desconectado, el anotador se pone al día al reconectarse.

## Pruebas

```bash
cd online && npx wrangler dev --config wrangler.jsonc --port 8787 --local --var CLEANUP_TTL_OVERRIDE_MS:3000
# En otra terminal, desde la raíz del repo:
ONLINE_BASE=http://127.0.0.1:8787 node --test --test-force-exit tests/online_cleanup.test.mjs tests/online_history.test.mjs
```
