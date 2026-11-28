# Pewfield game server: Colyseus running the shared simulation (and the server bot, src/game/sim/bot.ts).
FROM node:20-alpine
WORKDIR /app
RUN npm init -y >/dev/null \
  && npm install --omit=dev @colyseus/core@0.18.28 @colyseus/ws-transport@0.18.1 @colyseus/schema@5.0.49 express@5.3.0 tsx@4.23.15
# Only what the server needs: the room, the shared simulation, the wire protocol and the
# authority loop (lag compensation) the browser host uses too.
COPY server/index.ts server/DuelRoom.ts ./server/
COPY src/game/sim ./src/game/sim
COPY src/game/net/protocol.ts src/game/net/matchmaking.ts src/game/net/regions.ts src/game/net/authority.ts src/game/net/clone.ts src/game/net/serverSnapshot.ts src/game/net/fixedStep.ts src/game/net/wire.ts src/game/net/protocol-input.ts ./src/game/net/
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
