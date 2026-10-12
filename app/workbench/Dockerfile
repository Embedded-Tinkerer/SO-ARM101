# arm-on-zynq workbench: the study app, editor and terminal, plus the non-Xilinx toolchain.
# The repo is mounted at /workspace; the app code is read from there, so `git pull` updates it.
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        git openssh-client ca-certificates curl \
        iverilog verilator make gcc g++ libc6-dev \
        nano less procps iputils-ping \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system --add safe.directory '*'

# Same versions as requirements.txt for the packages the bench and simulations use.
RUN pip install --no-cache-dir \
        aiohttp==3.10.10 \
        cocotb==2.1.0 pytest==9.1.1 \
        numpy==2.2.6 matplotlib==3.11.2 \
        pyserial==3.5 PyVISA==1.16.2 PyVISA-py==0.8.1

ENV WORKBENCH_VENDOR=/opt/workbench/vendor
COPY vendor.py /opt/workbench/vendor.py
RUN python /opt/workbench/vendor.py

# Unraid's default owner for appdata and shares is nobody:users (99:100).
RUN useradd -u 99 -g 100 -d /config -M -s /bin/bash dev
ENV WORKBENCH_ROOT=/workspace WORKBENCH_HOST=0.0.0.0 WORKBENCH_PORT=8080 HOME=/config SHELL=/bin/bash
WORKDIR /workspace
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://127.0.0.1:8080/healthz || exit 1
CMD ["python", "/workspace/app/workbench/server.py"]
