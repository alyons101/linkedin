# Use the official Apify Playwright image which comes with Chrome pre-installed
FROM apify/actor-node-playwright-chrome:20

# Copy package.json files
COPY package*.json ./

# Install dependencies (Apify + Crawlee + Playwright)
RUN npm install --omit=dev

# Ensure the specific browser binaries for the installed Playwright version are downloaded
RUN npx playwright install --with-deps

# Copy the rest of the code
COPY . ./

# Run the actor
CMD [ "npm", "start" ]
