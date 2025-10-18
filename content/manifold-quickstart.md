---
title: "Manifold Quickstart"
date: 2025-10-18
description: "Step-by-step guide to deploying Manifold with Docker."
tags: ["manifold", "deployment", "quickstart"]
---

# Overview

This guide walks you through deploying Manifold locally using Docker. Follow these steps to get up and running quickly.

## Prerequisites

- **Docker** installed and running
- **Git** for cloning and updating submodules
- An **OpenAI API key** (for AI features)

## Step 1: Prepare Environment Files

Rename the example environment and config files:

```sh
cp example.env .env
cp config.yaml.example config.yaml
```

## Step 2: Configure OpenAI API Key

Edit your `.env` file to set your real OpenAI API key:

```sh
# Replace test123 with your actual key
sed -i '' 's/^OPENAI_API_KEY="[^"]*"/OPENAI_API_KEY="your-key-here"/' .env
```

## Step 3: Update Submodules

Initialize and update git submodules:

```sh
git submodule update --init --recursive
```

## Step 4: Create Log File

Create a log file for Manifold:

```sh
touch manifold.log
```

## Step 5: (Optional) Enable Web Search

To enable web search and fetch without SearXNG, pull the DuckDuckGo container:

```sh
docker pull mcp/duckduckgo
```

## Step 6: Deploy Manifold

Start the minimal deployment (this may take a few minutes):

```sh
docker compose up -d manifold pg-manifold
```

## Access the Web UI

Once containers are running, open your browser and go to:

[http://localhost:32180](http://localhost:32180)

## Troubleshooting

- Check `manifold.log` for errors.
- The most common issue is database DSN misconfiguration. Ensure your `.env` and `config.yaml` match the Docker Compose settings for the `pg-manifold` service.

---

For more details, see the [Manifold Documentation](../README.md) or contact the development team.
