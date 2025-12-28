# WSL Quick Start Guide

## The Problem

You're seeing `-sh: sudo: not found` because you're in a Docker container, not a proper WSL Linux distribution.

## Solution: Install Ubuntu WSL

### Step 1: Install Ubuntu WSL Distribution

Run this in PowerShell (as Administrator if needed):

```powershell
wsl --install -d Ubuntu
```

Or if that doesn't work:

```powershell
# List available distributions
wsl --list --online

# Install Ubuntu
wsl --install -d Ubuntu-22.04
```

### Step 2: After Installation

1. **Open Ubuntu** from Start Menu, or type `ubuntu` in PowerShell
2. **Set up your user** (first time only - create username/password)
3. **Update packages:**

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Step 3: Install Required Tools

```bash
# Install make and build tools
sudo apt-get install -y make build-essential

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and pip
sudo apt-get install -y python3 python3-pip

# Verify installations
make --version
node --version
python3 --version
```

### Step 4: Navigate to Your Project

```bash
# Access Windows files from WSL
cd /mnt/c/Users/ig134/Projects/FaceAuth

# Or clone inside WSL for better performance
cd ~
mkdir -p Projects
cd Projects
# Then copy or clone your project here
```

### Step 5: Use Make Commands

```bash
# Now make will work!
make dev
make build
make test
```

## Alternative: Use PowerShell Scripts

If you prefer to stay in Windows PowerShell, use the PowerShell scripts instead:

```powershell
npm run dev
npm run build
npm run test
```

## Docker Desktop Integration

Docker Desktop should work with WSL2 automatically. Verify:

```bash
# In Ubuntu WSL
docker --version
docker-compose --version
```

If Docker commands don't work, enable WSL integration in Docker Desktop:
1. Open Docker Desktop
2. Settings → Resources → WSL Integration
3. Enable integration for your Ubuntu distribution

