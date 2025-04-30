# Docker Setup for Quickesta Accounts Dashboard

This repository contains Docker configuration for running the Quickesta Accounts Dashboard application with Nginx.

## Prerequisites

- Docker and Docker Compose installed on your system
- SSL certificates for your domains
- .env file with required environment variables

## Project Structure

- `Dockerfile` - Contains the Dockerfile for the Next.js application
- `nginx/` - Contains the Nginx configuration and Dockerfile
- `docker-compose.yml` - Docker Compose configuration file
- `.env` - Environment variables for the Docker setup

## Environment Variables

Make sure you have a `.env` file in the root directory with the following variables:

```
NODE_ENV=production
PORT=3002
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SITE_URL=https://accounts.quickesta.com
NEXT_PUBLIC_HASURA_GRAPHQL_URL=https://hasura.domain.com.tr/v1/graphql
NEXT_PUBLIC_HASURA_ADMIN_SECRET=your_hasura_admin_secret
NEXT_PUBLIC_ABANT_API_PROXY=https://api.accounts.quickesta.com
NEXTAUTH_SECRET=your_nextauth_secret
```

The `.env` file is mounted as a volume to the Next.js container, so any changes to the file will be reflected in the container without rebuilding the image.

## SSL Certificates

Make sure you have the following SSL certificate files in the `nginx/` directory:

- `quickesta.com.pem` - SSL certificate
- `quickesta.com.key` - SSL certificate key

## Running the Application

To start the application, run:

```bash
docker-compose up -d
```

This will start the following services:

- `nginx` - Nginx web server (ports 80 and 443)
- `nextjs-app` - Next.js application (accounts.quickesta.com)

## Accessing the Application

Once the application is running, you can access it at:

- Dashboard: https://accounts.quickesta.com

## Stopping the Application

To stop the application, run:

```bash
docker-compose down
```

## Logs

To view the logs for a specific service, run:

```bash
docker-compose logs -f [service-name]
```

Replace `[service-name]` with one of: `nginx` or `nextjs-app`.

## Rebuilding the Application

If you make changes to the application code, you need to rebuild the Docker images:

```bash
docker-compose build
docker-compose up -d
```

## Troubleshooting

### Nginx Configuration

If you need to modify the Nginx configuration, edit the `nginx/nginx.conf` file and restart the Nginx service:

```bash
docker-compose restart nginx
```

### Next.js Application

If you need to modify the Next.js application, make your changes and rebuild the Docker image:

```bash
docker-compose build nextjs-app
docker-compose up -d
```
