FROM debian:latest
LABEL org.opencontainers.image.title="OFVp SSH Server" \
  org.opencontainers.image.description="SSH Server for OFVp" \
  org.opencontainers.image.vendor="ofvp_project" \
  org.opencontainers.image.licenses="GPL-3.0-or-later" \
  org.opencontainers.image.source="https://github.com/OFVp-Project/OpenSSH"

# Install core packages
ARG DEBIAN_FRONTEND="noninteractive"
RUN apt update && apt install -y wget curl procps && apt install -y openssh-client --no-install-recommends
RUN wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash

# Setup Project
EXPOSE 22/tcp
WORKDIR /app
VOLUME [ "/data" ]
ENTRYPOINT [ "node", "dist/index.js" ]
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build
ENV NODE_ENV="production"