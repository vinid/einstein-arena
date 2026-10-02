FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global @openai/codex@0.144.6

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
        matplotlib \
        numba \
        numpy \
        pandas \
        requests \
        scikit-learn \
        scipy \
        sympy \
    && ln -sf /opt/venv/bin/python /usr/local/bin/python \
    && ln -sf /opt/venv/bin/python3 /usr/local/bin/python3 \
    && printf 'export PATH="/opt/venv/bin:$PATH"\n' > /etc/profile.d/erdos-venv.sh

ENV PATH="/opt/venv/bin:${PATH}"
ENV VIRTUAL_ENV="/opt/venv"
ENV CODEX_HOME="/workspace/codex-state"
ENV HOME="/workspace/home"
ENV CUDA_VISIBLE_DEVICES=""

COPY codex_cost.py supervisor.py /opt/erdos/
COPY entrypoint.sh /usr/local/bin/erdos-agent
RUN chmod +x /usr/local/bin/erdos-agent
ENV PYTHONPATH="/opt/erdos"

WORKDIR /workspace
ENTRYPOINT ["erdos-agent"]
