# Imagen base con Node.js
FROM node:22-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia primero package.json para aprovechar cache de Docker
COPY package*.json ./

# Dependencias
RUN npm ci

# Copia el código fuente
COPY . .

# Compila NestJS
RUN npm run build

# NestJS escucha normalmente en 3000
EXPOSE 3000

# Arranca la aplicación compilada
CMD ["node", "dist/main"]