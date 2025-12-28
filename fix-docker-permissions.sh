#!/bin/bash
# Fix Docker permissions in WSL

echo "Fixing Docker permissions..."

# Add current user to docker group
sudo usermod -aG docker $USER

echo "✅ Added $USER to docker group"
echo ""
echo "⚠️  IMPORTANT: You need to log out and log back in for changes to take effect!"
echo ""
echo "After logging back in, test with:"
echo "  docker ps"
echo ""
echo "Or restart WSL:"
echo "  exit"
echo "  # Then reopen WSL"

