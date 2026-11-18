FROM node:22-bookworm-slim

RUN npm install -g relic && npm cache clean --force

ENTRYPOINT ["relic", "mcp"]
