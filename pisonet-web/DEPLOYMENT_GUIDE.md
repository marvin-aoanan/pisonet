# PisoNet Cloud Deployment Guide

Complete guide for deploying PisoNet to cloud platforms.

## Prerequisites for All Platforms

- Docker and Docker Compose installed
- Git for version control
- Environment configuration files prepared
- Domain name (for production)
- SSL certificate (for production HTTPS)

## Table of Contents

1. [Docker Deployment](#docker-deployment)
2. [Heroku](#heroku)
3. [AWS](#aws)
4. [Azure](#azure)
5. [DigitalOcean](#digitalocean)
6. [Google Cloud](#google-cloud)
7. [Environment Configuration](#environment-configuration)
8. [SSL/HTTPS Setup](#https-setup)
9. [Database Backup](#database-backup)
10. [Monitoring](#monitoring)

## Docker Deployment

### Prerequisites
```bash
docker --version  # v20.0+
docker-compose --version  # v1.29+
```

### Quick Start

1. **Clone or navigate to project:**
```bash
cd pisonet-web
```

2. **Create production environment files:**

**backend/.env:**
```env
NODE_ENV=production
PORT=5000
DATABASE_PATH=/app/data/pisonet.db
CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com
LOG_LEVEL=info
CLOUD_ENV=production
```

3. **Build and run:**
```bash
docker-compose up -d
```

4. **Verify:**
```bash
docker-compose ps
curl http://localhost/api/health
```

5. **View logs:**
```bash
docker-compose logs -f api
docker-compose logs -f web
```

### Production Considerations

**Data Persistence:**
```yaml
volumes:
  api-data:
    driver: local
```

**Resource Limits:**
```yaml
api:
  deploy:
    resources:
      limits:
        cpus: '1'
        memory: 512M
```

**Restart Policy:**
```yaml
restart_policy:
  condition: on-failure
  delay: 5s
  max_attempts: 3
```

## Heroku

### Deploy Backend

1. **Install Heroku CLI:**
```bash
# macOS
brew tap heroku/brew && brew install heroku

# Windows
# Download from heroku.com/download

# Verify
heroku --version
```

2. **Login to Heroku:**
```bash
heroku login
```

3. **Create app and deploy:**
```bash
cd backend
heroku create pisonet-api
heroku config:set NODE_ENV=production
heroku config:set DATABASE_PATH=/app/pisonet.db
heroku config:set CORS_ORIGIN=https://pisonet-web.herokuapp.com
git push heroku main
```

4. **View logs:**
```bash
heroku logs --tail
```

### Deploy Frontend

1. **Create Heroku app:**
```bash
cd frontend
heroku create pisonet-web
```

2. **Set environment variables:**
```bash
heroku config:set REACT_APP_API_URL=https://pisonet-api.herokuapp.com/api
heroku config:set REACT_APP_WS_URL=wss://pisonet-api.herokuapp.com
```

3. **Deploy:**
```bash
git push heroku main
```

### Heroku Addons

Database (if not using SQLite):
```bash
heroku addons:create heroku-postgresql:hobby-dev -a pisonet-api
```

Monitoring:
```bash
heroku addons:create papertrail:choklad -a pisonet-api
```

## AWS

### Using EC2

1. **Launch EC2 Instance:**
   - AMI: Ubuntu 20.04 LTS
   - Instance type: t3.small (minimum)
   - Security group: Allow ports 80, 443, 22

2. **Connect and setup:**
```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. **Deploy application:**
```bash
git clone https://github.com/yourusername/pisonet-web.git
cd pisonet-web
docker-compose up -d
```

### Using Elastic Beanstalk

1. **Install EB CLI:**
```bash
pip install awsebcli --upgrade --user
```

2. **Initialize:**
```bash
eb init -p docker pisonet-api --region us-east-1
```

3. **Deploy:**
```bash
eb create pisonet-env
eb deploy
```

### Using ECS

1. **Create ECS cluster**
2. **Push images to ECR**
3. **Create task definitions**
4. **Create service**

## Azure

### App Service

1. **Login to Azure CLI:**
```bash
az login
```

2. **Create resource group:**
```bash
az group create --name pisonet-rg --location eastus
```

3. **Create App Service Plan:**
```bash
az appservice plan create --name pisonet-plan \
  --resource-group pisonet-rg --sku B1 --is-linux
```

4. **Deploy backend:**
```bash
az webapp create --resource-group pisonet-rg \
  --plan pisonet-plan --name pisonet-api --runtime "node|18"

cd backend
az webapp deployment source config-zip \
  -g pisonet-rg -n pisonet-api --src app.zip
```

5. **Deploy frontend:**
```bash
az staticwebapp create -n pisonet-web \
  -g pisonet-rg -l eastus -b main --repo-url <your-repo-url>
```

### Container Instances

```bash
az container create --resource-group pisonet-rg \
  --name pisonet-api \
  --image pisonet-api:latest \
  --ports 5000 \
  --environment-variables NODE_ENV=production PORT=5000
```

## DigitalOcean

### Droplet Deployment

1. **Create Droplet:**
   - Size: $5/month (512MB)
   - OS: Ubuntu 20.04 LTS
   - Region: Nearest to you

2. **SSH and setup:**
```bash
# SSH to droplet
ssh root@your-droplet-ip

# Run DigitalOcean's setup script for Docker
curl https://releases.digitalocean.com/scripts/install-docker.sh | bash

# Add user to docker group
usermod -aG docker $USER
```

3. **Deploy:**
```bash
git clone your-repo
cd pisonet-web
docker-compose up -d
```

### App Platform

1. Create new app from Git
2. Select both frontend and backend
3. Set environment variables
4. Set build and run commands
5. Deploy

## Google Cloud

### Cloud Run (Serverless)

1. **Setup gcloud CLI:**
```bash
gcloud auth login
gcloud config set project PROJECT_ID
```

2. **Deploy backend:**
```bash
cd backend
gcloud run deploy pisonet-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars NODE_ENV=production
```

3. **Deploy frontend:**
```bash
cd frontend
gcloud run deploy pisonet-web \
  --source . \
  --platform managed \
  --region us-central1
```

### Compute Engine

Similar to AWS EC2 - start instance and docker-compose up

### Cloud SQL

For managed PostgreSQL database:
```bash
gcloud sql instances create pisonet-db \
  --database-version POSTGRES_13 \
  --tier db-f1-micro
```

## Environment Configuration

### Production .env Files

**backend/.env.production:**
```env
NODE_ENV=production
PORT=5000
DATABASE_PATH=/var/lib/pisonet/pisonet.db

# Use your domain
CORS_ORIGIN=https://pisonet.example.com,https://api.pisonet.example.com
LOG_LEVEL=warn

PESO_TO_SECONDS=60
MAX_SESSION_DURATION=3600

CLOUD_ENV=production
CLOUD_PROVIDER=aws  # or azure, digitalocean, etc

# Security
JWT_SECRET=your-secure-random-secret-here
ADMIN_PASSWORD=secure-password-here
```

**frontend/.env.production:**
```env
REACT_APP_API_URL=https://api.pisonet.example.com/api
REACT_APP_WS_URL=wss://api.pisonet.example.com
REACT_APP_API_TIMEOUT=10000
REACT_APP_DEBUG_MODE=false
```

## HTTPS Setup

### Using Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d pisonet.example.com -d api.pisonet.example.com
```

### Using CloudFlare SSL

1. Add domain to CloudFlare
2. Set SSL/TLS to "Full (strict)"
3. Update nameservers at domain registrar

### Docker with SSL

Update docker-compose.yml:
```yaml
web:
  volumes:
    - /etc/letsencrypt:/etc/nginx/certs:ro
  environment:
    - SSL_CERT_PATH=/etc/nginx/certs/live/pisonet.example.com
```

## Database Backup

### Automated Backups

**Backup script (backup.sh):**
```bash
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups"
mkdir -p $BACKUP_DIR

# Backup SQLite
cp /path/to/pisonet.db $BACKUP_DIR/pisonet_$TIMESTAMP.db

# Compress
tar -czf $BACKUP_DIR/pisonet_$TIMESTAMP.tar.gz $BACKUP_DIR/pisonet_$TIMESTAMP.db

# Upload to S3
aws s3 cp $BACKUP_DIR/pisonet_$TIMESTAMP.tar.gz s3://pisonet-backups/

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -mtime +7 -delete
```

**Cron job:**
```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup.sh
```

## Monitoring

### Application Performance

1. **Set up CloudWatch (AWS):**
```bash
aws cloudwatch put-metric-alarm --alarm-name pisonet-api-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

2. **Set up Application Insights (Azure):**
   - Enable in Application Settings
   - Configure alerts

3. **Set up DataDog or New Relic:**
   - Install agent
   - Configure dashboards

### Log Management

1. **CloudWatch Logs (AWS):**
```bash
aws logs create-log-group --log-group-name /pisonet/api
```

2. **Application Insights (Azure):**
   - Automatic instrumentation
   - Real-time metrics

3. **ELK Stack (Self-hosted):**
```yaml
elasticsearch:
  image: elasticsearch:latest
  
logstash:
  image: logstash:latest
  
kibana:
  image: kibana:latest
```

## Scaling

### Horizontal Scaling

Docker Swarm:
```bash
docker swarm init
docker service create --name pisonet-api \
  --replicas 3 -p 5000:5000 pisonet-api:latest
```

Kubernetes:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pisonet-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pisonet-api
  template:
    spec:
      containers:
      - name: api
        image: pisonet-api:latest
```

### Load Balancing

AWS ELB:
```bash
aws elb create-load-balancer --load-balancer-name pisonet-lb \
  --listeners InstancePort=5000,LoadBalancerPort=80,Protocol=HTTP
```

NGinx (if self-hosted):
```nginx
upstream pisonet_api {
  server api1:5000;
  server api2:5000;
  server api3:5000;
}

server {
  listen 80;
  server_name api.pisonet.example.com;
  
  location / {
    proxy_pass http://pisonet_api;
  }
}
```

## Health Checks

Configure health checks for your platform:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## Troubleshooting

### Port Issues
```bash
# Check port
netstat -tuln | grep 5000

# Kill process on port
lsof -ti:5000 | xargs kill -9
```

### Database Connection
```bash
# Check database file
ls -la /path/to/pisonet.db

# Verify permissions
chmod 644 /path/to/pisonet.db
```

### SSL Certificate Issues
```bash
# Verify certificate
openssl x509 -in cert.pem -text -noout

# Renew certificate
certbot renew --dry-run
```

---

**Last Updated**: 2024-02-19
