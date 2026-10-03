# Toolchain for programs/unbox_escrow. Same base as the Superteam bootcamp container
# (github.com/matzayonc/solana-live-course-2026): Anchor CLI 1.1.2 + Solana CLI 3.1.10,
# plus Node 24, pnpm, Rust 1.95.0 and Surfpool (Anchor 1.1's default local validator).
FROM quay.io/ottersec/anchor:v1.1.2

ENV DEBIAN_FRONTEND=noninteractive \
    RUST_VERSION=1.95.0

# The base ships Node 22 via nvm; tests run .ts through Node 24's native type stripping.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git build-essential pkg-config libssl-dev \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm
ENV PATH=/usr/bin:$PATH

RUN rustup toolchain install "$RUST_VERSION" --profile minimal \
        --component rustfmt --component clippy

RUN curl -sL https://run.surfpool.run/ | bash
ENV PATH=/root/.local/bin:$PATH

WORKDIR /work
CMD ["bash"]
