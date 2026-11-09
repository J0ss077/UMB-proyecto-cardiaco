FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# La API la consume el navegador, así que la URL es la pública del backend.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY --from=build /app/dist ./dist

RUN chmod -R a+r /app

EXPOSE 3000

USER node

CMD ["node", "server.js"]
