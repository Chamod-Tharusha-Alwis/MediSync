# MediSync

MediSync is a secure, full-stack healthcare platform featuring a zero-trust architecture, role-based access control (Doctor, Patient, Pharmacy, Hospital Admin), and an integrated Machine Learning engine for real-time outbreak detection and symptom diagnosis.

## Live Deployment
- **Frontend (Client)**: [LIVE URL PLACEHOLDER]
- **Backend API**: [LIVE URL PLACEHOLDER]
- **ML Engine**: [LIVE URL PLACEHOLDER]

## Architecture overview
- `client/`: React-based frontend using Tailwind CSS and Framer Motion.
- `server/`: Node.js/Express backend handling authentication, MongoDB interaction, and business logic.
- `ml-engine/`: Python Flask service predicting diseases based on symptoms (using `medisync.db` SQLite) and forecasting outbreaks.

## Local Development

You can run the entire stack via Docker:
```bash
docker-compose up --build
```
Alternatively, see the individual `README.md` files in each service folder for manual startup instructions.
