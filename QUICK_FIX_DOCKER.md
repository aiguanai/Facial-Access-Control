# Quick Fix for Docker Permission Error

## You're Already in Docker Group!

Since you're already in the docker group but still getting permission errors, try these solutions:

## Solution 1: Restart WSL (Most Common Fix)

```powershell
# In PowerShell, shutdown WSL
wsl --shutdown
```

Then reopen Ubuntu WSL:

```powershell
wsl -d Ubuntu
```

Now test:

```bash
docker ps
docker compose up -d
```

## Solution 2: Restart Docker Desktop

1. **Close Docker Desktop completely**
2. **Reopen Docker Desktop**
3. **Wait for it to fully start**
4. **Then try in WSL:**

```bash
docker ps
```

## Solution 3: Fix Socket Permissions

If the above doesn't work, try:

```bash
# In Ubuntu WSL
sudo chmod 666 /var/run/docker.sock
```

Or better (more secure):

```bash
sudo chown root:docker /var/run/docker.sock
sudo chmod 660 /var/run/docker.sock
```

## Solution 4: Verify Docker Desktop WSL Integration

Make sure Docker Desktop WSL integration is still enabled:

1. Docker Desktop → Settings
2. Resources → WSL Integration
3. Ensure "Ubuntu" is checked
4. Click "Apply & Restart"

## Test After Fix

```bash
# Should work without sudo
docker ps
docker compose version

# Should work now
cd /mnt/c/Users/ig134/Projects/FaceAuth
docker compose up -d
```

## Also Fixed

I've removed the `version: '3.8'` line from `docker-compose.yml` to eliminate the warning.

