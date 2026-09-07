<h1 align="center">
  <img src="dona.png" width="40" height="40" alt="Dona Simpsons">
  Anotador Clue: Los Simpson
  <img src="dona.png" width="40" height="40" alt="Dona Simpsons">
</h1>

Anotador digital para la edición **Clue: Los Simpsons** de Hasbro, pensado para jugar sin papel ni lápiz. Funciona como una web app de una sola página, sin instalación ni conexión a internet requerida durante el juego.

🔗 **Online:** [javierquero.github.io/ClueSimpsons](https://javierquero.github.io/ClueSimpsons/)

---

## ✨ Funcionalidades

- **Tabla de anotaciones** con todas las cartas del juego (sospechosos, armas y lugares), organizada por categoría y colapsable por sección. Primera fila y primera columna fijas al hacer scroll.
- **Ciclo de estados por celda** al tocar/hacer clic: Sin marcar → ❌ No tiene → ✔️ Tiene → ? Desconocido → Notas 1–3 → vacío
- **Selección de cartas para suposición**: tocá el nombre de una carta en la tabla para marcarla con 🔍. Una por categoría (sospechoso, arma y lugar). El botón Suposición se habilita solo al tener las 3 seleccionadas.
- **Registro de mano inicial** (Mis Cartas): selección de cartas propias al inicio, que se bloquea automáticamente. En la fila propia se puede marcar con 👁️ a quién le mostraste cada carta.
- **Sobre Confidencial**: se actualiza automáticamente cuando por descarte lógico se puede determinar qué carta está en el sobre. Al resolverse, el borde de la tabla titila en verde y suena una alerta con síntesis de voz.
- **Modal de Suposición**: registro de cada suposición con selector por jugador (Pasó / No mostró / carta específica). Las cartas propias no aparecen en el desplegable para evitar errores. Incluye historial de suposiciones previas.
- **Pantalla de bloqueo**: oculta el anotador con imagen de la caja del juego para cuando otro jugador mira la pantalla.
- **Selector de personaje**: tocá "Vos" en el header de la tabla para elegir tu personaje del juego. Se muestra en la columna de cartas.
- **Persistencia local**: el estado del juego (incluyendo lupas seleccionadas) se guarda automáticamente en `localStorage` y sobrevive recarga de página.
- **Soporte de 3 a 6 jugadores** con nombres editables directamente en la tabla.
- **Reglas del juego** integradas en la app.
- **PWA instalable**: se puede instalar en Android como app desde Chrome.

---

## 📱 Diseño Responsive

### Mobile
- Bottom navigation fija con acceso rápido a todas las acciones (Sobre, Suposición, Reglas, Bloquear, Opciones)
- Modales como **bottom sheets** que suben desde abajo con animación
- Tabla compacta con columna de cartas y fila de nombres fijas (sticky)
- Celdas con altura generosa para facilitar el toque con el dedo
- Zoom deshabilitado para evitar saltos al enfocar inputs

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

## 🗂️ Archivos del proyecto

```
ClueSimpsons/
├── index.html                  # App completa (HTML + CSS + JS en un solo archivo)
├── manifest.json               # Manifiesto PWA
├── sw.js                       # Service Worker (caché offline)
├── dona.png                    # Ícono de dona (favicon y logo)
├── icon-192.png                # Ícono PWA 192x192
├── icon-512.png                # Ícono PWA 512x512
├── caja-clue-simpsons.png      # Imagen de la caja (pantalla de bloqueo)
├── Homer_Simpson_Revised.ttf   # Fuente temática del header
└── README.md
```

---

## 🚀 Uso

Al ser un archivo estático, no requiere servidor ni dependencias externas más allá de Tailwind CSS (cargado desde CDN). Para usar localmente, basta con abrir `index.html` en cualquier navegador moderno.

Para desplegarlo en GitHub Pages, pusheá los archivos a la rama principal del repositorio y activá Pages desde la configuración del repo.

### Instalación como PWA (Android)

1. Abrí Chrome y entrá a [javierquero.github.io/ClueSimpsons](https://javierquero.github.io/ClueSimpsons/)
2. Menú (⋮) → "Instalar app" o "Agregar a pantalla de inicio"
3. Se instala con el ícono de la dona, sin barra del navegador

---

## 🛠️ Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- [Tailwind CSS](https://tailwindcss.com/) (via CDN)
- `localStorage` para persistencia del estado
- Web Audio API para el sonido de caso resuelto
- Web Speech API para síntesis de voz al resolver el caso
- Service Worker para funcionamiento offline

---

## 📄 Licencia del juego

Clue: Los Simpsons © 2005 Hasbro Internacional Inc. / Twentieth Century Fox Film Corporation.  
Fabricado bajo licencia por Toy Company S.R.L. — Buenos Aires, Argentina.  
Este proyecto es un anotador digital no oficial, sin fines comerciales.
