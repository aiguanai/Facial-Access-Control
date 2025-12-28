# WSL Setup Guide

## Accessing WSL Properly

You're currently in a Docker container, not a WSL distribution. Here's how to access WSL correctly:

### Option 1: Open WSL from Windows

1. **Open Windows Terminal or PowerShell**
2. **Type:** `wsl` or `wsl -d Ubuntu` (or your distribution name)
3. **You should see a Linux prompt like:** `username@hostname:~$`

### Option 2: Install WSL if not available

If you don't have a WSL distribution installed:

```powershell
# In PowerShell (as Administrator)
wsl --install

# Or install a specific distribution
wsl --install -d Ubuntu
```

### Option 3: Use Docker Desktop's WSL Integration

If you want to use Docker from WSL:

1. Open WSL: `wsl`
2. Docker Desktop should be accessible from WSL if WSL integration is enabled
3. Verify: `docker --version`

## Once in WSL

```bash
# Navigate to your project
cd /mnt/c/Users/ig134/Projects/FaceAuth

# Install make (if not installed)
sudo apt-get update
sudo apt-get install -y make build-essential

# Verify installation
make --version

# Now you can use make commands
make dev
```

## If You're Stuck in Docker Container

If you accidentally entered a Docker container:

1. **Exit the container:**
   ```bash
   exit
   ```

2. **Then open WSL properly:**
   ```powershell
   # In PowerShell
   wsl
   ```

## Quick Test

Run this in PowerShell to open WSL and check make:

```powershell
wsl bash -c "cd /mnt/c/Users/ig134/Projects/FaceAuth && which make || (sudo apt-get update && sudo apt-get install -y make) && make --version"
```

