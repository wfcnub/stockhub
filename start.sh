#!/bin/bash

# StockHub Development Startup Script
# This script starts the database, backend, and frontend for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to print colored messages
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if Docker daemon is running
docker_is_running() {
    docker info >/dev/null 2>&1
}

# Function to wait for a service
wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    local max_attempts=30
    local attempt=1
    
    print_info "Waiting for $service to be ready..."
    
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            print_error "$service did not start within $max_attempts seconds"
            return 1
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    print_success "$service is ready!"
    return 0
}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command_exists python3; then
    print_error "Python 3 is required but not installed."
    exit 1
fi

if ! command_exists node; then
    print_error "Node.js is required but not installed."
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is required but not installed."
    exit 1
fi

# Check if Docker is available AND running
USE_DOCKER=false
if command_exists docker; then
    if docker_is_running; then
        USE_DOCKER=true
    else
        print_warning "Docker is installed but not running."
        print_info "Will use SQLite instead of PostgreSQL."
        print_info "Start Docker Desktop if you want to use PostgreSQL."
    fi
else
    print_info "Docker is not installed. Will use SQLite instead of PostgreSQL."
fi

print_success "All prerequisites met!"

# ============================================
# Setup Environment Files
# ============================================
print_info "Setting up environment files..."

# Root .env (gitignored): the dev database password lives here, never in the repo
ROOT_ENV="$SCRIPT_DIR/.env"
if [ ! -f "$ROOT_ENV" ]; then
    print_info "Creating .env with a random database password..."
    if command_exists openssl; then
        GEN_PASSWORD="$(openssl rand -hex 24)"
    else
        GEN_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    fi
    sed "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${GEN_PASSWORD}|" "$SCRIPT_DIR/.env.example" > "$ROOT_ENV"
    chmod 600 "$ROOT_ENV"
    print_success "Created .env"
fi
set -a
# shellcheck disable=SC1090
. "$ROOT_ENV"
set +a
POSTGRES_USER="${POSTGRES_USER:-stockhub}"
POSTGRES_DB="${POSTGRES_DB:-stockhub}"
DB_PORT="${DB_PORT:-5432}"

# Backend .env
BACKEND_ENV="$SCRIPT_DIR/backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
    print_info "Creating backend/.env..."
    cat > "$BACKEND_ENV" << 'EOF'
# Database Configuration
# Use SQLite for local development (no Docker needed)
DATABASE_URL=sqlite:///./stockhub.db

# Or use PostgreSQL (requires Docker; start.sh fills in the password from the root .env):
# DATABASE_URL=postgresql://stockhub:<POSTGRES_PASSWORD>@localhost:5432/stockhub

# CORS Origins (JSON list)
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:3001","http://127.0.0.1:3001"]

# Active exchanges (comma-separated)
ACTIVE_EXCHANGES=IDX
EOF
    print_success "Created backend/.env"
else
    print_info "backend/.env already exists"
fi

# Frontend .env.local
FRONTEND_ENV="$SCRIPT_DIR/frontend/.env.local"
if [ ! -f "$FRONTEND_ENV" ]; then
    print_info "Creating frontend/.env.local..."
    cat > "$FRONTEND_ENV" << 'EOF'
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
EOF
    print_success "Created frontend/.env.local"
else
    # Check if the URL has the correct path
    if ! grep -q "api/v1" "$FRONTEND_ENV" 2>/dev/null; then
        print_warning "frontend/.env.local exists but may have incorrect API URL."
        print_info "Updating NEXT_PUBLIC_API_URL..."
        echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > "$FRONTEND_ENV"
        print_success "Updated frontend/.env.local"
    else
        print_info "frontend/.env.local already exists"
    fi
fi

# ============================================
# Start Database (if using Docker)
# ============================================
DB_HOST="localhost"

if [ "$USE_DOCKER" = true ]; then
    print_info "Starting PostgreSQL database with Docker..."
    
    # Check if database container is already running
    if docker ps 2>/dev/null | grep -q "stockhub-db"; then
        print_success "Database container is already running"
    elif docker ps -a 2>/dev/null | grep -q "stockhub-db"; then
        print_info "Starting existing database container..."
        docker start stockhub-db >/dev/null 2>&1 && print_success "Database container started" || {
            print_warning "Failed to start database container. Falling back to SQLite."
            USE_DOCKER=false
        }
    else
        print_info "Creating and starting database container..."
        if docker run -d \
            --name stockhub-db \
            -e POSTGRES_USER="$POSTGRES_USER" \
            -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
            -e POSTGRES_DB="$POSTGRES_DB" \
            -p "127.0.0.1:${DB_PORT}:5432" \
            -v stockhub_pg18_data:/var/lib/postgresql \
            postgres:18-alpine >/dev/null 2>&1; then
            print_success "Database container created and started"
        else
            print_warning "Failed to create database container. Falling back to SQLite."
            USE_DOCKER=false
        fi
    fi
    
    # Wait for PostgreSQL to be ready (only if Docker is still being used)
    if [ "$USE_DOCKER" = true ]; then
        if command_exists nc; then
            if ! wait_for_service "$DB_HOST" "$DB_PORT" "PostgreSQL"; then
                print_warning "PostgreSQL did not start in time. Falling back to SQLite."
                USE_DOCKER=false
            fi
        else
            print_warning "nc not installed, skipping database health check"
            sleep 5
        fi
        
        # Update backend .env to use PostgreSQL
        if [ -f "$BACKEND_ENV" ] && [ "$USE_DOCKER" = true ]; then
            if grep -q "sqlite" "$BACKEND_ENV"; then
                print_info "Updating backend/.env to use PostgreSQL..."
                # Create a backup
                cp "$BACKEND_ENV" "$BACKEND_ENV.bak"
                # Update DATABASE_URL
                PG_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${DB_PORT}/${POSTGRES_DB}"
                sed -i.bak "s|DATABASE_URL=sqlite:///\.\/stockhub\.db|DATABASE_URL=${PG_URL}|" "$BACKEND_ENV" 2>/dev/null || \
                sed -i '' "s|DATABASE_URL=sqlite:///\.\/stockhub\.db|DATABASE_URL=${PG_URL}|" "$BACKEND_ENV"
                rm -f "$BACKEND_ENV.bak"
                print_success "Updated backend/.env to use PostgreSQL"
            fi
        fi
    fi
fi

# If not using Docker, ensure SQLite config
if [ "$USE_DOCKER" = false ]; then
    if [ -f "$BACKEND_ENV" ]; then
        # Make sure we're using SQLite
        if ! grep -q "sqlite" "$BACKEND_ENV"; then
            print_info "Configuring backend/.env to use SQLite..."
            sed -i.bak 's|DATABASE_URL=postgresql.*|DATABASE_URL=sqlite:///./stockhub.db|' "$BACKEND_ENV" 2>/dev/null || \
            sed -i '' 's|DATABASE_URL=postgresql.*|DATABASE_URL=sqlite:///./stockhub.db|' "$BACKEND_ENV"
            rm -f "$BACKEND_ENV.bak"
        fi
    fi
    print_info "Using SQLite database (no Docker required)"
fi

# ============================================
# Setup Backend
# ============================================
print_info "Setting up backend..."

cd "$SCRIPT_DIR/backend"

# Prefer uv (uv.lock) and fall back to venv + requirements.txt
USE_UV=false
if command_exists uv && [ -f uv.lock ]; then
    USE_UV=true
    print_info "Installing Python dependencies with uv..."
    uv sync --frozen
    print_success "Python dependencies installed (uv)"
else
    if [ ! -d "venv" ]; then
        print_info "Creating Python virtual environment..."
        python3 -m venv venv
        print_success "Virtual environment created"
    fi
    print_info "Activating virtual environment..."
    source venv/bin/activate
    print_info "Installing Python dependencies..."
    pip install -q --upgrade pip
    pip install -q -r requirements.txt
    print_success "Python dependencies installed"
fi

# ============================================
# Setup Frontend
# ============================================
print_info "Setting up frontend..."

cd "$SCRIPT_DIR/frontend"

# Install dependencies
print_info "Installing Node.js dependencies..."
npm install --silent
print_success "Node.js dependencies installed"

# ============================================
# Start Services
# ============================================
print_info "Starting services..."
echo ""

# Create a trap to kill all background processes on exit
trap 'kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT

# Start backend
print_info "Starting backend server..."
cd "$SCRIPT_DIR/backend"
if [ "$USE_UV" = true ]; then
    uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
else
    source venv/bin/activate
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
fi
BACKEND_PID=$!
print_success "Backend started on http://localhost:8000"

# Wait a bit for backend to start
sleep 2

# Start frontend
print_info "Starting frontend development server..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
print_success "Frontend started on http://localhost:3000"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  StockHub Development Environment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  ${BLUE}Frontend:${NC}     http://localhost:3000"
echo -e "  ${BLUE}Backend API:${NC}  http://localhost:8000"
echo -e "  ${BLUE}API Docs:${NC}     http://localhost:8000/docs"
if [ "$USE_DOCKER" = true ]; then
    echo -e "  ${BLUE}Database:${NC}    PostgreSQL on localhost:${DB_PORT}"
else
    echo -e "  ${BLUE}Database:${NC}    SQLite (./backend/stockhub.db)"
fi
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for all background processes
wait