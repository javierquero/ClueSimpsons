# 🍩 Anotador Clue: Los Simpson

Un anotador digital e inteligente para el juego de mesa **Clue: Los Simpson** (Hasbro / Toy Company). Diseñado para reemplazar la hoja de papel tradicional, automatizar deducciones y mantener la privacidad de tus notas durante la partida.

![Pantalla de Bloqueo](caja-clue-simpsons.png)

---

## 🚀 Características Principales

* 🔒 **Pantalla de Bloqueo de Privacidad:** Bloqueá la pantalla con un solo toque mostrando la caja oficial del juego para evitar que otros jugadores miren tus notas.
* 🎴 **Marcador de Mano Inicial:** Seleccioná rápidamente las cartas que te tocaron al empezar para tacharlas automáticamente en las columnas de tus rivales.
* 🧠 **Deducción Automática e Inteligente:**
  * Al confirmar una carta para un jugador (✔️), coloca cruces (❌) al resto.
  * Autodescarta celdas cuando un jugador alcanza el límite total de cartas asignadas según la cantidad de participantes (3 a 6 jugadores).
  * Detecta si nadie tiene una carta para asignarla directamente al **Sobre Confidencial**.
* 📜 **Historial de Suposiciones:** Registrá quién sospechó de qué combinación, qué jugadores pasaron y quién mostró una carta.
* ✉️ **Gestión del Sobre Confidencial:** Modál dedicado para registrar o autodeducir al asesino, arma y lugar.
* ↩️ **Función Deshacer (Undo):** Sistema de historial que permite revertir cambios si marcás una celda por error.
* 📤 **Guardado y Compartido:** Exportá el estado de la partida mediante un código de texto o envialo directo por WhatsApp para restaurarlo en otro dispositivo.
* 📖 **Reglas Integradas:** Reglamento oficial de la edición de Los Simpson accesible en cualquier momento.
* 📱 **Diseño Responsive:** Funciona directo en el navegador de cualquier celular, tablet o PC sin instalar nada.

---

## 🛠️ Tecnologías

* **HTML5 & JavaScript ES6+** (Vanilla JS, sin frameworks externos).
* **Tailwind CSS** (vía CDN para interfaz y diseño adaptativo).
* **LocalStorage API** (Para guardar el estado de la partida automáticamente en el navegador).

---

## 📂 Estructura del Repositorio

```text
├── index.html              # Código fuente completo (Versión 1)
├── caja-clue-simpsons.png  # Imagen para la pantalla de bloqueo
└── README.md               # Documentación del proyecto

## 📂 Mejoras / Actualizaciones

Selector de cartas al principio de la partida. Que obligue al jugador a seleccionar su cartas. Que controle la cantidad que le tocan.

En la configuración deberían estar Reglas y compartir. Y debería haber un nuevo botón que diga algo así como nueva partida y cargue el que ahora esta en configuración.
Versión tiene que estar en configuración en configuración.
Bloquear tiene que estar bien a la izquierda, agrupado con la configuración y nueva partida.
El banner de ganador arriba no se ve. Tiene que ser en el centro de la pantalla y con sonido. Preferentemente que diga el resultado.

