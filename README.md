# README for the Shayd protocol at ETH Buenos Aires 2025

gm

## Docker Setup

This project includes Docker configuration for easy development and deployment.

### Prerequisites

1. **Install Docker** (if not already installed):
   ```bash
   # On Fedora/RHEL
   sudo dnf install docker docker-compose
   ```

2. **Start Docker service**:
   ```bash
   sudo systemctl start docker
   sudo systemctl enable docker  # Optional: enable on boot
   ```

3. **Add your user to the docker group** (to avoid using sudo):
   ```bash
   sudo usermod -aG docker $USER
   # Log out and log back in, or run:
   newgrp docker
   ```

### Running the Application

#### Development Mode (with hot reload)

```bash
# Build and start containers
docker-compose -f docker-compose.dev.yml up --build

# Or run in detached mode (background)
docker-compose -f docker-compose.dev.yml up --build -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop containers
docker-compose -f docker-compose.dev.yml down
```

**Services:**
- **Next.js App**: Available at `http://localhost:3000`
- **Anvil (Local Blockchain)**: Available at `http://localhost:8545`

#### Production Mode

```bash
# Build and start
docker-compose up --build

# Run in background
docker-compose up --build -d

# Stop
docker-compose down
```

### Useful Docker Commands

```bash
# Rebuild without cache
docker-compose -f docker-compose.dev.yml build --no-cache

# View running containers
docker-compose ps

# Execute commands in container
docker-compose exec nextjs sh

# Stop and remove volumes
docker-compose down -v

# View logs for specific service
docker-compose logs nextjs
docker-compose logs anvil
```

### Troubleshooting

#### Permission Denied Errors

If you encounter permission errors:

1. **Ensure Docker is running**:
   ```bash
   sudo systemctl status docker
   ```

2. **Add user to docker group** (see Prerequisites above)

3. **If using SELinux** (Fedora/RHEL), the `:z` flag in docker-compose should handle it automatically. If issues persist:
   ```bash
   # Check SELinux status
   getenforce
   ```

#### Build Failures

- **Yarn/Corepack issues**: The Dockerfile automatically enables Corepack for Yarn 3.2.3
- **Missing dependencies**: Ensure all package files are present in the `scaffold` directory
- **Port conflicts**: Make sure ports 3000 and 8545 are not in use by other applications

#### Container Won't Start

```bash
# Check container logs
docker-compose logs nextjs

# Rebuild from scratch
docker-compose down -v
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up
```

### Project Structure

- `Dockerfile` - Production multi-stage build
- `Dockerfile.dev` - Development build with hot reload support
- `docker-compose.yml` - Production orchestration
- `docker-compose.dev.yml` - Development orchestration
- `.dockerignore` - Files excluded from Docker build context