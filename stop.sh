#!/bin/bash

# StockHub Development Stop Script
# This script stops all running services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

print_info "Stopping StockHub services..."

# Stop backend (uvicorn)
print_info "Stopping backend..."
pkill -f "uvicorn app.main:app" 2>/dev/null && print_success "Backend stopped" || print_warning "Backend not running"

# Stop frontend (next)
print_info "Stopping frontend..."
pkill -f "next dev" 2>/dev/null && print_success "Frontend stopped" || print_warning "Frontend not running"

# Stop database container (if exists)
if command -v docker >/dev/null 2>&1; then
    if docker ps | grep -q "stockhub-db"; then
        print_info "Stopping database container..."
        docker stop stockhub-db >/dev/null 2>&1 && print_success "Database container stopped" || print_warning "Could not stop database container"
    else
        print_info "Database container not running"
    fi
fi

echo ""
print_success "All services stopped!"