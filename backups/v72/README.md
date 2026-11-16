<h1 align="center">
  Anotador Clue: Los Simpson 
</h1>

<p align="center"><strong>Versión actual: v58</strong></p>

Anotador digital para la edición **Clue: Los Simpsons** de Hasbro, pensado para jugar sin papel ni lápiz. Funciona en el navegador o instalada como app y no necesita conexión a Internet durante el juego.

🔗 **Online:** [javierquero.github.io/ClueSimpsons](https://javierquero.github.io/ClueSimpsons/)

---

## ✨ Funcionalidades

- **Tabla de anotaciones** con todas las cartas del juego (sospechosos, armas y lugares), organizada por categoría y colapsable por sección. Primera fila y primera columna fijas al hacer scroll.
- **Ciclo de estados por celda** al tocar/hacer clic: Sin marcar → ❌ No tiene → ? Desconocido → Notas 1–3 → vacío.
- **Confirmación con toque largo**: coloca ✔️ en un jugador y ❌ en el resto para esa carta. La acción completa se puede revertir con Deshacer.
- **Selección de cartas para suposición**: tocá el nombre de una carta en la tabla para marcarla con 🔍. Una por categoría (sospechoso, arma y lugar). El botón Suposición se habilita solo al tener las 3 seleccionadas.
- **Registro de mano inicial** (Mis Cartas): selección de cartas propias al inicio, que se bloquea automáticamente. En la fila propia se puede marcar con 👁️ a quién le mostraste cada carta.
- **Sobre Confidencial**: se actualiza automáticamente cuando por descarte lógico se puede determinar qué carta está en el sobre. Al resolverse, el borde de la tabla titila en verde y suena una alerta con síntesis de voz.
- **Modal de Suposición**: registro de cada suposición con selector por jugador (Pasó / No mostró / carta específica). Incluye historial de respuestas y eliminación de entradas incorrectas.
- **Pantalla de bloqueo**: oculta el anotador con imagen de la caja del juego para cuando otro jugador mira la pantalla.
- **Selector de personaje**: tocá "Vos" en el header de la tabla para elegir tu personaje del juego. Se muestra en la columna de cartas.
- **Persistencia local validada**: el estado se guarda automáticamente, avisa si el guardado falla y recupera de forma segura partidas de versiones anteriores.
- **Deshacer y Rehacer**: permite recorrer las últimas acciones, incluso después de refrescar la página.
- **Soporte de 3 a 6 jugadores** con nombres editables directamente en la tabla.
- **Reglas del juego** integradas en la app.
- **Guía rápida inicial**: explica los gestos la primera vez y puede volver a abrirse desde Reglas.
- **PWA instalable, offline y con actualización automática**: precarga los recursos y aplica las versiones nuevas al abrir o volver a la app.
- **Accesibilidad**: admite zoom, teclado, foco visible, movimiento reducido y descripciones de cartas, jugadores y estados para lectores de pantalla.
- **Encabezado animado**: las donas entran rodando desde ambos costados al abrir la aplicación.

---

## 📱 Diseño Responsive

### Mobile
- Bottom navigation fija con acceso rápido a todas las acciones (Sobre, Suposición, Reglas, Bloquear, Opciones)
- Modales como **bottom sheets** que suben desde abajo con animación
- Tabla compacta con columna de cartas y fila de nombres fijas (sticky)
- Celdas con altura generosa para facilitar el toque con el dedo
- Zoom permitido para ampliar el contenido cuando sea necesario

### Desktop
- Header con todos los botones en la parte superior, mismo orden que mobile
- Tabla amplia con nombres de jugadores editables inline

---

## 🃏 Cartas del juego

| Categoría     | Cartas (en orden del talonario original) |
|---------------|------------------------------------------|
| Sospechosos   | Coronel Mostaza, Profesor Moradillo, Sr. Verdi, Sra. Azulino, Srita. Escarlata, Sra. Blanco |
| Armas         | Collar, Barra de Plutonio, Honda, Saxofón, Guante extensible, Dona envenenada |
| Lugares       | Asilo Springfield, Bolerama, El Calabozo del Androide, Casa de los Simpsons, Estudios Krustylu, El Holandés Frito, Kwik-E-Mart, Mansión Burns, Planta Nuclear |

---

## 🖼️ Imágenes

Las 22 cartas continúan en formato **PNG**, miden 184×213 px, pesan entre 14,2 y 19,9 KiB cada una y suman aproximadamente 380,4 KiB. La dona y la caja usan **WebP** para reducir mucho su descarga sin afectar su uso en pantalla:

| Archivo | Dimensiones | Peso |
|---------|-------------|------|
| `dona.webp` | 128×126 px | 5,7 KiB |
| `caja-clue-simpsons.webp` | 622×467 px | 51,7 KiB |
| `icon-192.png` | 192×192 px | 39,7 KiB |
| `icon-512.png` | 512×512 px | 204,8 KiB |

---

## 🏷️ Versionado

La versión del README, la aplicación, la caché del service worker y la etiqueta de Git avanzan juntas. Cada publicación queda disponible como una etiqueta `vNN` en [Releases](https://github.com/javierquero/ClueSimpsons/releases).

---

## 🗂️ Archivos del proyecto

```
ClueSimpsons/
├── index.html                  # Estructura de la aplicación
├── tailwind.css               # Estilos Tailwind compilados y reducidos
├── tailwind.input.css         # Entrada para reconstruir Tailwind
├── tailwind.config.js         # Configuración de Tailwind
├── styles.css                 # Diseño y animaciones
├── js/app.js                  # Lógica, estado y renderizado
├── tests/test_app.py           # Pruebas automáticas con Playwright
├── manifest.json               # Manifiesto PWA
├── sw.js                       # Service Worker (caché offline)
├── dona.webp                   # Dona optimizada del encabezado
├── icon-192.png                # Ícono PWA 192x192
├── icon-512.png                # Ícono PWA 512x512
├── caja-clue-simpsons.webp     # Caja optimizada (pantalla de bloqueo)
├── Homer_Simpson_Revised.ttf   # Fuente temática del header
└── README.md
```

---

## 🚀 Uso

Al ser un archivo estático, no necesita dependencias externas durante su uso. Para usar localmente, basta con servir la carpeta con cualquier servidor web estático.

Si se agregan o cambian clases de Tailwind, el CSS se reconstruye con `npm install` y `npm run build:css`.

Para desplegarlo en GitHub Pages, pusheá los archivos a la rama principal del repositorio y activá Pages desde la configuración del repo.

### Instalación como PWA (Android)

1. Abrí Chrome y entrá a [javierquero.github.io/ClueSimpsons](https://javierquero.github.io/ClueSimpsons/)
2. Menú (⋮) → "Instalar app" o "Agregar a pantalla de inicio"
3. Se instala con el ícono de la dona, sin barra del navegador

---

## 🛠️ Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- [Tailwind CSS](https://tailwindcss.com/) compilado y reducido localmente
- `localStorage` para persistencia del estado
- Web Audio API para el sonido de caso resuelto
- Web Speech API para síntesis de voz al resolver el caso
- Service Worker para funcionamiento offline

---

## 📄 Licencia del juego

Clue: Los Simpsons © 2005 Hasbro Internacional Inc. / Twentieth Century Fox Film Corporation.  
Fabricado bajo licencia por Toy Company S.R.L. — Buenos Aires, Argentina.  
Este proyecto es un anotador digital no oficial, sin fines comerciales.
