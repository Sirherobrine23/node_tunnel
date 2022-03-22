FROM ubuntu:latest AS downloadnode
LABEL org.opencontainers.image.title="OFVp Deamon Maneger"
LABEL org.opencontainers.image.description="Main docker image to maneger anothers docker images."
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/OpenSSH"
ENV DEBIAN_FRONTEND="noninteractive"

# Install core packages
RUN apt update && apt -y install build-essential pkg-config gnupg git wget curl unzip zip sudo jq nano ca-certificates openssl procps

# Install latest docker image
RUN mkdir /tmp/Node && NODEURL=""; NODEVERSION=$(curl -sL https://api.github.com/repos/nodejs/node/releases | grep tag_name | cut -d '"' -f 4 | sort -V | tail -n 1) && \
case $(uname -m) in \
  x86_64 ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-x64.tar.gz";; \
  aarch64 ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-arm64.tar.gz";; \
  armv7l ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-armv7l.tar.gz";; \
  ppc64el ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-ppc64le.tar.gz";; \
  s390x ) NODEURL="https://nodejs.org/download/release/$NODEVERSION/node-$NODEVERSION-linux-s390x.tar.gz";; \
  *) echo "Unsupported architecture"; exit 1;; \
esac && \
echo "Node bin Url: ${NODEURL}"; wget -q "${NODEURL}" -O /tmp/node.tar.gz && \
tar xfz /tmp/node.tar.gz -C /tmp/Node && \
mkdir /tmp/nodebin && cp -rp /tmp/Node/*/* /tmp/nodebin && ls /tmp/nodebin && rm -rfv /tmp/nodebin/LICENSE /tmp/nodebin/*.md

FROM ubuntu:latest as server
LABEL org.opencontainers.image.title="OFVp Deamon Maneger"
LABEL org.opencontainers.image.description="Main docker image to maneger anothers docker images."
LABEL org.opencontainers.image.vendor="ofvp_project"
LABEL org.opencontainers.image.licenses="GPL-3.0-or-later"
LABEL org.opencontainers.image.source="https://github.com/OFVp-Project/OpenSSH"
ENV DEBIAN_FRONTEND="noninteractive"
COPY --from=downloadnode /tmp/nodebin/ /usr
# Install Openssh Server
RUN apt update && apt install -y openssh-server && rm -fv /etc/ssh/sshd_config /etc/ssh/ssh_host_* && npm -g install npm@latest

# Setup Project
WORKDIR /usr/src/Backend
ENV DAEMON_PASSWORD=""
ENV DAEMON_USER=""
ENV DAEMON_HOST="http://localhost:5000"
EXPOSE 22/tcp
VOLUME [ "/data" ]
ENTRYPOINT [ "node", "--trace-warnings", "src/index.js" ]
COPY package*.json ./
RUN npm install --no-save
COPY ./ ./