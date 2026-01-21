# Use the official Apify Playwright image which comes with Chrome pre-installed
FROM apify/actor-node-playwright-chrome:20

# Copy package.json files
COPY package*.json ./

# Install dependencies (Apify + Crawlee + Playwright)
RUN npm install --omit=dev

# Copy the rest of the code
COPY . ./

# Run the actor
CMD [ "npm", "start" ]
