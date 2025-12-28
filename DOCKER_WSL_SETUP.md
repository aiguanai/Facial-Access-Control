# Docker Desktop WSL Integration Setup

## Problem
`docker-compose` command not found in WSL because Docker Desktop WSL integration is not enabled.

## Solution: Enable WSL Integration

### Step 1: Open Docker Desktop Settings

1. **Open Docker Desktop** (make sure it's running)
2. Click the **Settings** (gear icon) in the top right
3. Go to **Resources** → **WSL Integration**

### Step 2: Enable Integration

1. **Enable the integration toggle** at the top
2. **Check the box** next to "Ubuntu" (your WSL distribution)
3. Click **"Apply & Restart"**

### Step 3: Verify in WSL

After Docker Desktop restarts, open Ubuntu WSL and verify:

```bash
# Check Docker
docker --version

# Check Docker Compose
docker-compose --version

# Or use the newer command
docker compose version
```

## Alternative: Use Docker Compose V2 Command

If integration is enabled but `docker-compose` still doesn't work, use the newer syntax:

```bash
# Instead of: docker-compose up -d
docker compose up -d

# Instead of: docker-compose down
docker compose down
```

## If Docker Desktop Integration Doesn't Work

### Option 1: Install Docker Compose in WSL

```bash
# Install Docker Compose standalone
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify
docker-compose --version
```

### Option 2: Use Docker from Windows

Run Docker commands from PowerShell instead:

```powershell
# In PowerShell
docker-compose up -d
```

Then use WSL only for `make` commands that don't need Docker directly.

## Quick Fix Script

Run this in Ubuntu WSL to check and fix:

```bash
#!/bin/bash
# Check if Docker is accessible
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Please enable WSL integration in Docker Desktop."
    echo "Settings → Resources → WSL Integration → Enable Ubuntu"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Docker Compose not found. Trying alternative..."
    # Try V2 syntax
    docker compose version || echo "Please enable WSL integration in Docker Desktop"
fi
```

