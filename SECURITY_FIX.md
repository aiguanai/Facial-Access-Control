# Security Fixes Applied

## Issues Found

1. **Node.js 18.x is deprecated** - No longer receiving security updates
2. **Python externally-managed environment** - Can't install packages system-wide

## Solutions Applied

### 1. Upgraded to Node.js 20 LTS

Node.js 20 is the current LTS (Long Term Support) version with active security updates.

**If you already installed Node.js 18, upgrade:**

```bash
# Remove old Node.js
sudo apt-get remove nodejs

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should show v20.x.x
```

### 2. Using Python Virtual Environments

Instead of installing packages system-wide (which Ubuntu blocks for security), we now use virtual environments per service.

**Benefits:**
- ✅ Isolated dependencies per service
- ✅ No system-wide package conflicts
- ✅ More secure (doesn't modify system Python)
- ✅ Follows Python best practices

**Virtual environments are automatically created in:**
- `services/face-matching/venv/`
- `services/liveness-service/venv/`

## Updated Installation

The `install-dependencies.sh` script has been updated to:
1. Install Node.js 20 LTS (instead of 18)
2. Create virtual environments for Python services
3. Install Python packages in isolated environments

## Run Updated Install Script

```bash
cd /mnt/c/Users/ig134/Projects/FaceAuth
chmod +x install-dependencies.sh
./install-dependencies.sh
```

## Manual Upgrade (if needed)

If you already ran the old script:

```bash
# Upgrade Node.js to 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create virtual environments
cd services/face-matching
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

cd ../liveness-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

## Verify Security

```bash
# Check Node.js version (should be 20.x.x)
node --version

# Check Python virtual environments exist
ls services/face-matching/venv
ls services/liveness-service/venv
```

## Why This Matters

- **Node.js 18**: No security patches after April 2025
- **Node.js 20 LTS**: Supported until April 2026 with security updates
- **Virtual environments**: Prevents system Python conflicts and follows security best practices

