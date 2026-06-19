FROM ubuntu:24.04

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf2.13 \
    build-essential \
    cargo \
    ccache \
    clang \
    cmake \
    libasound2-dev \
    libdbus-1-dev \
    libgtk-3-dev \
    libpulse-dev \
    libx11-dev \
    libx11-xcb-dev \
    libxcb-shm0-dev \
    libxcb1-dev \
    libxext-dev \
    libxkbcommon-dev \
    libxrandr-dev \
    mesa-common-dev \
    nasm \
    ninja-build \
    nodejs \
    npm \
    python3 \
    python3-pip \
    python3-setuptools \
    rustc \
    yasm \
    libavcodec-dev \
    libavutil-dev \
    libswresample-dev \
    libclang-dev \
    llvm-dev \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --break-system-packages mercurial

COPY assets/ /build/neonwolf/assets/
COPY scripts/ /build/neonwolf/scripts/
COPY patches/ /build/neonwolf/patches/
COPY settings/ /build/neonwolf/settings/
COPY themes/ /build/neonwolf/themes/
COPY Makefile version release /build/neonwolf/

WORKDIR /build/neonwolf

RUN make fetch && make dir

# Install Rust via rustup (system rust 1.75 is too old for Firefox 129)
# Use latest for cbindgen, then switch to 1.79 for Firefox build (packed_simd compat)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    . "$HOME/.cargo/env" && \
    rustup install stable && \
    rustup target add x86_64-unknown-linux-gnu && \
    cargo +stable install cbindgen --version 0.26.0 && \
    rustup install 1.79.0 && \
    rustup default 1.79.0 && \
    rustup target add x86_64-unknown-linux-gnu

WORKDIR /build/neonwolf/neonwolf-129.0-1
# mozconfig already set up by make dir (from assets/mozconfig.new)
RUN . "$HOME/.cargo/env" && \
    MOZBUILD_STATE_PATH=/build/.mozbuild ./mach configure
RUN . "$HOME/.cargo/env" && \
    MOZBUILD_STATE_PATH=/build/.mozbuild ./mach build
RUN cat browser/locales/shipped-locales | xargs ./mach package-multi-locale --locales

CMD ["/bin/bash"]
