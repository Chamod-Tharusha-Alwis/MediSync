# MediSync - Server (Backend)

The Node.js and Express backend for MediSync. It handles secure Zero-Trust OTP authentication, Role-Based Access Control, MongoDB data persistence, and secure Cloudinary PDF encryption.

## Live URL
[LIVE URL PLACEHOLDER]

## Environment Variables
Create a `.env` file with the following variable names (do NOT include actual secrets):
- `ADMIN_PASSWORD`
- `CLIENT_URL`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_PASS`
- `EMAIL_PROVIDER`
- `EMAIL_USER`
- `ENCRYPTION_KEY`
- `INTERNAL_API_KEY`
- `JWT_REFRESH_SECRET`
- `JWT_SECRET`
- `ML_ENGINE_URL`
- `MONGO_URI`
- `NODE_ENV`
- `PORT`
- `REDIS_URL`
- `RESEND_FROM_ADDRESS`
- `RESEND_SMTP_HOST`
- `RESEND_SMTP_PASS`
- `RESEND_SMTP_PORT`
- `RESEND_SMTP_USER`
- `SEED_TEST_PASSWORD`
- `SINGLE_INSTANCE_DEV_MODE`
- `TEST_MODE`
- `VAULT_TOKEN`

## Local Run Instructions
1. Navigate to the `server` directory.
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev` (or `npm start`)
