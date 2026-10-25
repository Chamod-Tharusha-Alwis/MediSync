FROM node:24-alpine@sha256:1200d815de24f8dcca745fbf7651d166034a35adbcad8860a8538ffff44f1420
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src/ ./src/
COPY reference-data/ ./reference-data/
# Read packaged reference hashes only: no database, seeders or providers.
RUN node -e "require('./src/utils/loadDatasets')"
# This pure runtime adapter is used by the protected admin preview route.
COPY scripts/previewSyntheticOutbreakScenarios.js ./scripts/previewSyntheticOutbreakScenarios.js
RUN mkdir -p uploads/lab-temp uploads/lab-reports && chown node:node uploads uploads/lab-temp uploads/lab-reports
USER node
EXPOSE 5000
CMD ["node", "src/production.js"]
