FROM rust:1.100.0-slim-bookworm@sha256:7c7d4eb4d05b7781187a327809466cfddf29753f6defdc3d19a0e291951b7a37

ARG TARGETARCH
ARG SCARB_VERSION=2.16.1
ARG SNFORGE_VERSION=0.57.0
ARG USC_VERSION=2.10.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl git pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) \
        ARCH="x86_64"; \
        SCARB_SHA="0815b49559ab3c7d40158fe2c5b27eee9f8b7a28951da537bd48fb045a35db77"; \
        SNFORGE_SHA="860d0f6c538a15bc235600d14d01730180f57076bb05503493b0a2155588ad35"; \
        USC_SHA="1e6b91126543efb5861e6dc7a992793c738214d908d2dda4ab104b9459865031" ;; \
      arm64) \
        ARCH="aarch64"; \
        SCARB_SHA="1dfec3fc9e25d9a6454936e5093d9f85c62af00e2c7349d1336a804bc12b3d2e"; \
        SNFORGE_SHA="07d2c22f4eaac4b85c8bd4b1afb1d40853bc51756f3f858f071b06257a127032"; \
        USC_SHA="53b1a997f079a4313e135001f04a480ebd6b82d6bf2d931c8a73769fa1552ab3" ;; \
      *) echo "Unsupported architecture ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    SCARB="scarb-v${SCARB_VERSION}-${ARCH}-unknown-linux-gnu.tar.gz"; \
    curl -fL --retry 3 "https://github.com/software-mansion/scarb/releases/download/v${SCARB_VERSION}/${SCARB}" -o "/tmp/${SCARB}"; \
    echo "${SCARB_SHA}  /tmp/${SCARB}" | sha256sum -c -; \
    tar -xzf "/tmp/${SCARB}" -C /tmp; \
    install -m 0755 "/tmp/scarb-v${SCARB_VERSION}-${ARCH}-unknown-linux-gnu/bin/scarb" /usr/local/bin/scarb; \
    FOUNDRY="starknet-foundry-v${SNFORGE_VERSION}-${ARCH}-unknown-linux-gnu.tar.gz"; \
    curl -fL --retry 3 "https://github.com/foundry-rs/starknet-foundry/releases/download/v${SNFORGE_VERSION}/${FOUNDRY}" -o "/tmp/${FOUNDRY}"; \
    echo "${SNFORGE_SHA}  /tmp/${FOUNDRY}" | sha256sum -c -; \
    tar -xzf "/tmp/${FOUNDRY}" -C /tmp; \
    install -m 0755 "/tmp/starknet-foundry-v${SNFORGE_VERSION}-${ARCH}-unknown-linux-gnu/bin/snforge" /usr/local/bin/snforge; \
    USC="universal-sierra-compiler-v${USC_VERSION}-${ARCH}-unknown-linux-gnu.tar.gz"; \
    curl -fL --retry 3 "https://github.com/software-mansion/universal-sierra-compiler/releases/download/v${USC_VERSION}/${USC}" -o "/tmp/${USC}"; \
    echo "${USC_SHA}  /tmp/${USC}" | sha256sum -c -; \
    tar -xzf "/tmp/${USC}" -C /tmp; \
    install -m 0755 "/tmp/universal-sierra-compiler-v${USC_VERSION}-${ARCH}-unknown-linux-gnu/bin/universal-sierra-compiler" /usr/local/bin/universal-sierra-compiler; \
    rm -rf /tmp/*.tar.gz /tmp/scarb-* /tmp/starknet-foundry-* /tmp/universal-sierra-compiler-*; \
    scarb --version; snforge --version; universal-sierra-compiler --version

WORKDIR /project
ENTRYPOINT ["snforge", "test"]
