# Quick Start in WSL (Ubuntu)

## ✅ Ubuntu is Now Installed!

## Next Steps:

### 1. Open Ubuntu WSL

```powershell
# In PowerShell, type:
wsl
# or
wsl -d Ubuntu
```

### 2. First Time Setup (if prompted)

When you first open Ubuntu, you'll be asked to:
- Create a username
- Set a password

### 3. Install Make and Tools

Once in Ubuntu, run:

```bash
# Update package list
sudo apt-get update

# Install make and build tools
sudo apt-get install -y make build-essential

# Verify installation
make --version
```

### 4. Navigate to Your Project

```bash
# Access Windows files from WSL
cd /mnt/c/Users/ig134/Projects/FaceAuth

# Verify you're in the right place
ls -la
```

### 5. Install Node.js and Python (if needed)

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.10+
sudo apt-get install -y python3 python3-pip python3-venv

# Verify
node --version
python3 --version
```

### 6. Now You Can Use Make!

```bash
# Start infrastructure
docker-compose up -d

# Start all microservices
make dev

# Build all services
make build

# Run tests
make test
```

## Docker Desktop Integration

Make sure Docker Desktop WSL integration is enabled:

1. Open Docker Desktop
2. Go to Settings → Resources → WSL Integration
3. Enable integration for "Ubuntu"
4. Click "Apply & Restart"

Then verify in Ubuntu:

```bash
docker --version
docker-compose --version
```

## All Set! 🎉

You can now use all `make` commands in WSL Ubuntu!

