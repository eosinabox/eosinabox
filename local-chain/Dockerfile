# A single-node Antelope (Spring) chain for local development, with WebAuthn keys enabled.
FROM ubuntu:22.04
ARG SPRING_VERSION=1.2.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq \
 && curl -fsSL -o /tmp/spring.deb \
      "https://github.com/AntelopeIO/spring/releases/download/v${SPRING_VERSION}/antelope-spring_${SPRING_VERSION}_amd64.deb" \
 && apt-get install -y --no-install-recommends /tmp/spring.deb \
 && rm -rf /tmp/spring.deb /var/lib/apt/lists/*
COPY contracts /contracts
COPY boot.sh /boot.sh
EXPOSE 8888
ENTRYPOINT ["/boot.sh"]
