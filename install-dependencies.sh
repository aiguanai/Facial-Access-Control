#!/bin/bash
# Install Node.js, Python, and other dependencies in WSL Ubuntu

set -e

echo "Installing dependencies for FaceAuth..."

# Update package list
echo "Updating package list..."
sudo apt-get update

# Install Node.js 20.x LTS (supported version)
echo "Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
    echo "Note: If you have Node.js 18, consider upgrading to 20 LTS for security"
fi

# Install Python 3.10+ and pip
echo "Installing Python 3 and pip..."
sudo apt-get install -y python3 python3-pip python3-venv

# Install build essentials (needed for some npm packages)
echo "Installing build tools..."
sudo apt-get install -y build-essential

# Install Python dependencies in virtual environments (recommended)
echo "Installing Python packages in virtual environments..."

# Face Matching Service
echo "Setting up face-matching service..."
cd services/face-matching
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd ../..

# Liveness Service
echo "Setting up liveness-service..."
cd services/liveness-service
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd ../..

echo "Python virtual environments created successfully!"

# Verify installations
echo ""
echo "=== Verification ==="
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "Python: $(python3 --version)"
echo "pip: $(pip3 --version)"
echo ""
echo "✅ Dependencies installed!"

