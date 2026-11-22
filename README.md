# Duelo Doble

Dos juegos 1 contra 1 con personajes originales, jugables desde el mismo teclado o en línea:

- **Jugar en público:** <https://duelo-doble.onrender.com>
- **Carrera de plataformas:** muévete a izquierda y derecha para esquivar obstáculos, salta rocas y troncos, agáchate bajo las ramas, y administra el turbo para llegar antes que tu rival a la meta.
- **Ping-pong relámpago:** devuelve la pelota y llega a cinco puntos.

Las salas en línea admiten como máximo dos jugadores por juego. Cada juego tiene su propia sala; si ya está llena, el servidor rechaza al siguiente jugador.

## Jugar localmente

Requiere Node.js 20 o posterior.

```sh
npm install
npm start
```

Abre <http://localhost:3000>. En la carrera, el jugador 1 se mueve con **A/D**, salta con **W**, se agacha con **S** y acelera con **Shift**; el jugador 2 se mueve con **←/→**, salta con **↑**, se agacha con **↓** y acelera con **Enter**. En ping-pong, los jugadores usan **W/S** y **↑/↓**, respectivamente.

## Publicar en Render

El archivo `render.yaml` define un servicio gratuito de Node.js que sirve la web y las partidas WebSocket en el mismo dominio. Render puede suspender la instancia gratuita si no recibe tráfico; después de un periodo inactivo, la primera conexión puede tardar 50 segundos o más.

## Pruebas

```sh
npm test
```
