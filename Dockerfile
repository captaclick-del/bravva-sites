# Imagen de producción para PDFmania (Node + Postgres). pg es JS puro: build rápido y sin compilar nada nativo.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# La conexión a la base va por DATABASE_URL (Supabase). Se configura en el hosting.

EXPOSE 3000
CMD ["node", "server.js"]
