FROM node:22.21.1

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# COPY ENV variable
COPY .env ./

# Install app dependencies
RUN pnpm install --frozen-lockfile

# Bundle app source
COPY . .

# Generate Prisma client (after schema.prisma is present)
RUN pnpx prisma generate

# Start the bot
CMD [ "pnpm", "start" ]

