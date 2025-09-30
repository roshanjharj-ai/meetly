# --- Stage 1: Build the React App ---
FROM node:18-alpine AS build

WORKDIR /app

# ⭐ FIX: Declare the build argument so Docker knows to expect it.
ARG REACT_APP_WEBSOCKET_URL

# ⭐ FIX: Set it as an environment variable for the 'npm run build' command to use.
ENV REACT_APP_WEBSOCKET_URL=$REACT_APP_WEBSOCKET_URL

COPY package*.json ./
RUN npm install

COPY . .
# This command will now correctly use the variable passed from 'docker build' or 'docker-compose'
RUN npm run build

# --- Stage 2: Serve with Nginx ---
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]