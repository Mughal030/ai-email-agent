---
title: AI Email Agent
emoji: 📧
colorFrom: purple
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# AI Email Agent

Self-improving AI email outreach agent with multi-model NVIDIA AI routing (Nemotron, Mistral, MiniMax + fallbacks), real SMTP/IMAP email sending, smart send scheduler, and AI lead researcher.

## Features

- **Multi-Model AI Router**: 5 NVIDIA models with automatic fallback
  - Nemotron-3 Super 120B → psychology analysis + self-improvement
  - Mistral Small 4 119B → email drafting
  - MiniMax M3 → reply classification
  - Deepseek V4 Flash + Gemma 4 31B → fallbacks

- **Real Email Sending**: SMTP via Gmail app password + IMAP for reply detection
- **Smart Send Scheduler**: 50/day limit, send windows, region-aware timing, 3-min gaps
- **AI Lead Researcher**: Web search for real companies + AI analysis + outreach generation
- **Self-Improvement Loop**: Logs outcomes, extracts lessons, refines future emails
- **24/7 Background Scheduler**: Runs inside the Next.js process (setInterval)

## Setup

1. Set all environment variables as Secrets (see .env.example for the full list)
2. The app auto-creates the database on first run
3. Use UptimeRobot to ping `https://your-space.hf.space/api/health` every 5 min to prevent sleeping

## Tech Stack

- Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui
- Prisma ORM (SQLite, stored in /data for persistence)
- nodemailer (SMTP) + imapflow (IMAP) + mailparser
- NVIDIA API (OpenAI-compatible endpoint)
- Recharts for analytics
