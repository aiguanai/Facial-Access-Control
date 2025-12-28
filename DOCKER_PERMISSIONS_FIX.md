# Fix Docker Permission Denied Error

## Problem
```
permission denied while trying to connect to the Docker daemon socket
```

## Solution

### Option 1: Add User to Docker Group (Recommended)

Run these commands in Ubuntu WSL:

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Log out and log back in (or restart WSL)
exit
```

Then reopen WSL and test:

```bash
docker ps
```

### Option 2: Use Sudo (Quick Fix, Not Recommended)

```bash
# Temporary workaround
sudo docker compose up -d
```

**Note:** This requires sudo for every Docker command, which is not ideal.

### Option 3: Restart WSL (After Adding to Group)

If you've already added yourself to the docker group but it's not working:

```powershell
# In PowerShell
wsl --shutdown
```

Then reopen WSL:

```powershell
wsl -d Ubuntu
```

### Verify Fix

After logging back in, test:

```bash
# Should work without sudo
docker ps
docker compose version

# Should work now
cd /mnt/c/Users/ig134/Projects/FaceAuth
docker compose up -d
```

## Quick Fix Script

I've created a script to help. Run in Ubuntu WSL:

```bash
cd /mnt/c/Users/ig134/Projects/FaceAuth
chmod +x fix-docker-permissions.sh
./fix-docker-permissions.sh
```

Then **log out and log back in** to WSL.

## Also Fix docker-compose.yml Warning

The warning about `version` being obsolete can be fixed by removing that line from `docker-compose.yml`.

