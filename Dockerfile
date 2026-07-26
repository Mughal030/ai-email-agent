FROM node:20-slim
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx prisma generate
RUN npx next build
RUN cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV HF_PRODUCTION_MODE=true
ENV ADMIN_USERNAME=adminmughal03
ENV ADMIN_PASSWORD=adminumair0302
ENV INTERNAL_APP_URL=http://localhost:3000
ENV NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
ENV NVIDIA_MODEL_DEEPSEEK=deepseek-ai/deepseek-v4-flash
ENV NVIDIA_MODEL_GEMMA=google/gemma-4-31b-it
ENV NVIDIA_MODEL_MINIMAX=minimaxai/minimax-m3
ENV NVIDIA_MODEL_MISTRAL=mistralai/mistral-small-4-119b-2603
ENV NVIDIA_MODEL_NEMOTRON=nvidia/nemotron-3-super-120b-a12b
ENV SMTP_HOST=smtp.gmail.com
ENV SMTP_PORT=465
ENV SMTP_FROM_NAME="AI Sales Agent"
ENV SMTP_FROM_EMAIL=ghab79646@gmail.com
ENV IMAP_HOST=imap.gmail.com
ENV IMAP_PORT=993
CMD ["sh", "-c", "npx prisma db push && node .next/standalone/server.js"]
