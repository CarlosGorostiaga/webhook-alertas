# Imagen base
FROM node:20-alpine

# Variables y directorio
ENV NODE_ENV=production
WORKDIR /app

# Copiamos manifiestos
COPY package*.json ./

# <<< CLAVE: usamos npm install (NO npm ci) >>>
RUN npm install --omit=dev

# Copiamos el resto del código
COPY . .

# Carpeta para subidas
RUN mkdir -p /app/uploads

# Puerto
EXPOSE 3000

# Arranque
CMD ["node", "index.js"]
