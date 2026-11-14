# Build from the repository root:  docker build -f server/Dockerfile -t olu-server .
FROM node:20-alpine
WORKDIR /app
COPY server/server.js server/server.js
COPY src/royal.js src/royal.js
ENV PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "server/server.js"]
