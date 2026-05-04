#!/bin/bash

# JOM AI - AWS EC2 Automated Deployment Script (Amazon Linux 2023)
# Usage: ./deploy.sh [DOMAIN_OR_IP]

set -e # Exit on error

if [ -z "$1" ]; then
    echo "Usage: $0 [DOMAIN_OR_IP]"
    echo "Example: $0 54.255.123.45"
    exit 1
fi

DOMAIN=$1
PROJECT_ROOT=$(pwd)

echo "--- Starting Deployment for $DOMAIN (Amazon Linux) ---"

# 1. Update System and Install Dependencies
echo "Installing system dependencies..."
sudo dnf update -y
sudo dnf install -y python3 python3-pip nginx git curl nodejs

# 2. Setup Backend
echo "Setting up Backend..."
cd "$PROJECT_ROOT/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn

# Ensure .env exists
if [ ! -f ".env" ]; then
    echo "WARNING: backend/.env not found. Please create it manually."
    touch .env
fi

# 3. Setup Frontend
echo "Building Frontend..."
cd "$PROJECT_ROOT/frontend"
npm install

# Prepare production .env
if [ -f ".env" ]; then
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=/api|g" .env
else
    echo "VITE_API_BASE_URL=/api" > .env
    echo "WARNING: frontend/.env not found. Supabase keys might be missing."
fi

npm run build

# 4. Configure Nginx
echo "Configuring Nginx..."
# Amazon Linux uses /etc/nginx/conf.d/ for custom configs
NGINX_CONF="/etc/nginx/conf.d/jom-ai.conf"
sudo bash -c "cat > $NGINX_CONF <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Frontend
    location / {
        root $PROJECT_ROOT/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF"

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# 5. Setup Systemd Service for Backend
echo "Setting up Systemd service..."
SERVICE_FILE="/etc/systemd/system/jom-ai-backend.service"
sudo bash -c "cat > $SERVICE_FILE <<EOF
[Unit]
Description=Gunicorn instance to serve JOM AI Backend
After=network.target

[Service]
User=$USER
Group=nginx
WorkingDirectory=$PROJECT_ROOT/backend
Environment=\"PATH=$PROJECT_ROOT/backend/venv/bin\"
ExecStart=$PROJECT_ROOT/backend/venv/bin/gunicorn --workers 3 --bind localhost:5000 app:app

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl start jom-ai-backend
sudo systemctl enable jom-ai-backend

echo "--- Deployment Complete! ---"
echo "Your app should be live at: http://$DOMAIN"
