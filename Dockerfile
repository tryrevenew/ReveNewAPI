# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install the API's dependencies in the container
RUN npm install

# Copy the configuration example file
COPY config.example.js ./config.example.js

# Copy the rest of the API code to the container
COPY . .

# Create config.js from example if it doesn't exist
RUN if [ ! -f config.js ]; then cp config.example.js config.js; fi

# Specify the command to run when the container starts
CMD [ "node", "index.js" ]
