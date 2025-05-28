FROM node:24-slim

RUN apt-get update && apt-get install -y \
    ffmpeg fontconfig sed wget ca-certificates \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 \
    libasound2 libgbm-dev libatk1.0-0 libpangocairo-1.0-0 \
    libatspi2.0-0 libdrm2 libxdamage1 libxrandr2 x11-utils \
    --no-install-recommends && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY src/package.json ./
RUN npm install

COPY src/ /app/

EXPOSE 3000

CMD ["node", "index.js"]
