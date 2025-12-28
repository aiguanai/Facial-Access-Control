# Install Dependencies in WSL Ubuntu

## Problem
`npm: not found` and `python: not found` errors when running `make dev`

## Solution: Install Node.js and Python

### Quick Install Script

I've created a script to install everything. Run in Ubuntu WSL:

```bash
cd /mnt/c/Users/ig134/Projects/FaceAuth
chmod +x install-dependencies.sh
./install-dependencies.sh
```

### Manual Installation

Or install manually:

#### 1. Install Node.js 18

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

#### 2. Install Python 3

```bash
# Install Python 3 and pip
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv

# Verify
python3 --version
pip3 --version
```

#### 3. Install Build Tools

```bash
# Needed for compiling some npm packages
sudo apt-get install -y build-essential
```

#### 4. Install Python Packages (for ML services)

```bash
# Install required Python packages
pip3 install --user fastapi uvicorn[standard] opencv-python numpy pillow requests python-dotenv

# Or create virtual environments per service (recommended)
```

### Verify Everything Works

```bash
# Check Node.js
node --version    # Should show v18.x.x
npm --version     # Should show 9.x.x or 10.x.x

# Check Python
python3 --version # Should show Python 3.10.x or higher

# Test npm
npm --version

# Test Python
python3 -c "import sys; print(sys.version)"
```

### Then Try make dev Again

```bash
cd /mnt/c/Users/ig134/Projects/FaceAuth
make dev
```

## Alternative: Use Virtual Environments (Recommended for Python)

For better isolation, use virtual environments for Python services:

```bash
# For face-matching service
cd services/face-matching
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# For liveness-service
cd ../liveness-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Then update the Makefile to use the virtual environments, or run services manually.

