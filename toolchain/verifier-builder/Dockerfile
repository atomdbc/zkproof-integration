FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c

ARG TARGETARCH
ARG SCARB_VERSION=2.16.1
ARG GARAGA_VERSION=1.1.0

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        libgmp-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) SCARB_ARCH="x86_64-unknown-linux-gnu"; SCARB_SHA256="0815b49559ab3c7d40158fe2c5b27eee9f8b7a28951da537bd48fb045a35db77" ;; \
      arm64) SCARB_ARCH="aarch64-unknown-linux-gnu"; SCARB_SHA256="1dfec3fc9e25d9a6454936e5093d9f85c62af00e2c7349d1336a804bc12b3d2e" ;; \
      *) echo "Unsupported Docker architecture ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    ARCHIVE="scarb-v${SCARB_VERSION}-${SCARB_ARCH}.tar.gz"; \
    curl --fail --location --retry 3 \
      "https://github.com/software-mansion/scarb/releases/download/v${SCARB_VERSION}/${ARCHIVE}" \
      --output "/tmp/${ARCHIVE}"; \
    echo "${SCARB_SHA256}  /tmp/${ARCHIVE}" | sha256sum --check -; \
    tar -xzf "/tmp/${ARCHIVE}" -C /tmp; \
    install -m 0755 "/tmp/scarb-v${SCARB_VERSION}-${SCARB_ARCH}/bin/scarb" /usr/local/bin/scarb; \
    rm -rf "/tmp/${ARCHIVE}" "/tmp/scarb-v${SCARB_VERSION}-${SCARB_ARCH}"

# Garaga 1.1.0 permits fastecdsa 4, but its Python code still imports the
# pre-v4 curvemath module. The lock keeps the compatible version and pins all
# transitive Python dependencies used by the builder.
COPY requirements.lock /tmp/requirements.lock
RUN python -m pip install --no-cache-dir --pre --requirement /tmp/requirements.lock \
    && test "$(python -c 'import importlib.metadata; print(importlib.metadata.version("garaga"))')" = "${GARAGA_VERSION}" \
    && garaga --help >/dev/null \
    && scarb --version \
    && rm /tmp/requirements.lock

COPY build_verifier.py /usr/local/bin/build_verifier.py

ENV HOME=/tmp/starkcircom-home \
    PROJECT_NAME=groth16_verifier \
    OUTPUT_DIRECTORY=/output

ENTRYPOINT ["python", "/usr/local/bin/build_verifier.py"]
