FROM node:23

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install app dependencies
RUN pnpm install --frozen-lockfile

# Bundle app source
COPY . .

# Expose port (adjust if your bot uses a specific port)
EXPOSE 3000

# Start the bot
CMD [ "pnpm", "start" ]

