# Anotador Clue: Los Simpson

Un anotador digital e inteligente para el juego de mesa **Clue: Los Simpson** (Hasbro / Toy Company). Diseñado para reemplazar la hoja de papel tradicional, automatizar deducciones y mantener la privacidad de tus notas durante la partida.

![Pantalla de Bloqueo](caja-clue-simpsons.png)

---

## 🚀 Características Principales

* **Pantalla de Bloqueo de Privacidad:** Bloqueá la pantalla con un solo toque mostrando la caja oficial del juego para evitar que otros jugadores miren tus notas.
* **Marcador de Mano Inicial:** Seleccioná rápidamente las cartas que te tocaron al empezar para tacharlas automáticamente en las columnas de tus rivales.
* **Deducción Automática e Inteligente:**
   * Al confirmar una carta para un jugador (✔️), coloca cruces (❌) al resto.
   * Detecta si nadie tiene una carta para asignarla directamente al **Sobre Confidencial**.
* **Historial de Suposiciones:** Registrá quién sospechó de qué combinación, qué jugadores pasaron y quién mostró una carta.
* **Gestión del Sobre Confidencial:** Modál dedicado para registrar o autodeducir al asesino, arma y lugar.
* **Reglas Integradas:** Reglamento oficial de la edición de Los Simpson accesible en cualquier momento.
* **Diseño Responsive:** Funciona directo en el navegador de cualquier celular, tablet o PC sin instalar nada.
* **Sonido de victoria:** al resolver el caso, suena una campanita (ding‑dong) y aparece un modal festivo.
* **Estados por celda:** vacío → ❌ → ✔️ → 1 → 2 → 3 → 4 → 5 → 👁️ → vacío

---

## 🛠️ Tecnologías utilizadas

* **HTML5 & JavaScript ES6+** (Vanilla JS, sin frameworks externos).
* **Tailwind CSS** (vía CDN para interfaz y diseño adaptativo).
* **LocalStorage API** (Para guardar el estado de la partida automáticamente en el navegador).
* **Web Audio API** – generación de sonidos sin archivos externos.

