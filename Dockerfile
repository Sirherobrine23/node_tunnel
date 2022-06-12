# Copy only badvpn image
FROM ghcr.io/ofvp-project/badvpn:latest AS badvpn_prebuilt

# Create (Open)ssh server
FROM debian:latest as server
LABEL org.opencontainers.image.title="OFVp SSH Server"
LABEL org.opencontainers.image.description="SSH Server for OFVp"
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/OpenSSH"

# Install core packages
ENV DEBIAN_FRONTEND="noninteractive"
RUN apt update && apt -y install wget curl git python3-minimal

# Install latest node
RUN RUN wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash

# Install Openssh Server
RUN apt update && \
  apt install -y openssh-server && \
  rm -fv /etc/ssh/sshd_config /etc/ssh/ssh_host_* && \
  ln -s -v /app/ssh_config.conf /etc/ssh/sshd_config && \
  ln -s -v /app/Banner.html /etc/ssh/banner

# Copy badvpn
COPY --from=badvpn_prebuilt /usr/bin/badvpn-udpgw /usr/bin/badvpn

# Setup Project
ENV MongoDB_URL="mongodb://localhost:27017/OFVpServer" PASSWORD_ENCRYPT=""
ENV DONTSTARTBADVPN="false"
EXPOSE 22/tcp
VOLUME [ "/data" ]
WORKDIR /app
ENTRYPOINT [ "node", "--trace-warnings", "dist/index.js" ]
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build
