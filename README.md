# Duelo Doble

Dos juegos 1 contra 1 con personajes originales, jugables desde el mismo teclado o en línea:

- **Jugar en público:** <https://duelo-doble.onrender.com>
- **Choque de Chispas:** dos robots saltan y se golpean; gana quien conecte tres golpes.
- **Ping-pong relámpago:** devuelve la pelota y llega a cinco puntos.

Las salas en línea admiten como máximo dos jugadores por juego. Cada juego tiene su propia sala; si ya está llena, el servidor rechaza al siguiente jugador.

## Jugar localmente

Requiere Node.js 20 o posterior.

```sh
npm install
npm start
```

Abre <http://localhost:3000>. Para una partida local se comparten teclado: A/D/W/F para el jugador 1, flechas/Enter para el jugador 2; en ping-pong, W/S y flechas arriba/abajo.

## Publicar en Render

El archivo `render.yaml` define un servicio gratuito de Node.js que sirve la web y las partidas WebSocket en el mismo dominio. Render puede suspender la instancia gratuita si no recibe tráfico; después de un periodo inactivo, la primera conexión puede tardar 50 segundos o más.

## Pruebas

```sh
npm test
```
