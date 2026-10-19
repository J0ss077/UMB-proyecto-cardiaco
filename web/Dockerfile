FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./

RUN chmod -R a+r /app

EXPOSE 3000

USER node

CMD ["node", "server.js"]
