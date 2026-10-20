# Bayyinah

Bayyinah is a people-management and employee-onboarding application with role-aware workspaces for HR professionals, managers, and employees. The frontend is built with React and Vite; the backend uses Django REST Framework and PostgreSQL.

## Project structure

- `accounts/` — accounts, employee roles, CSV onboarding, invitations, password resets, and database models.
- `bayyinah_backend/` — Django project settings and URL configuration.
- `frontend/` — React interface and Vite configuration.
- `Logo.PNG` — Bayyinah brand logo.

## Requirements

- Python 3.12 or newer
- Node.js and npm
- PostgreSQL

## Local setup

Create and activate a Python virtual environment, then install backend dependencies:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Set a local Django signing key and the connection details for your own PostgreSQL database in the same PowerShell window. Do not commit these values:

```powershell
$env:BAYYINAH_DJANGO_SECRET_KEY = (& python -c "import secrets; print(secrets.token_urlsafe(50))")
$env:BAYYINAH_DB_NAME = "Bayyinah"
$env:BAYYINAH_DB_USER = "postgres"
$env:BAYYINAH_DB_PASSWORD = Read-Host "PostgreSQL password"
$env:BAYYINAH_DB_HOST = "localhost"
$env:BAYYINAH_DB_PORT = "5432"
```

Configure email delivery to test employee invitations and password-reset emails:

```powershell
$env:BAYYINAH_EMAIL_HOST_USER = Read-Host "Email address used to send invitations"
$env:BAYYINAH_EMAIL_APP_PASSWORD = Read-Host "Email app password"
```

Users can request a password-reset link from the login page. Invitation and reset
links use signed, time-limited tokens tied to the user's account; no invitation-token
or CSV-batch tables are needed.

The initial migration creates the business tables in the submitted schema:
`organization`, `"User"`, `employee`, `manager`, `project`, `task`, `skills`,
`employee_skills`, `task_skills`, `attendancerecord`, `leavetype`, `leaverequest`,
`meetingschedule`, `goal`, `task_goal`, `evaluation`, `predictionfactor`, and
`burnoutsurvey`, and `burnoutprediction`. PostgreSQL generates the single-column
integer IDs.
`BurnoutSurvey` has no PredictionFactor relationship because its schema has no
factor-name column.

Passwords must be at least 8 characters, include an uppercase letter and a number,
and pass Django's common-password and user-similarity checks. Password resets cannot
reuse the current password.

Django and SimpleJWT also require a few framework bookkeeping and authentication
tables when migrations run. These are not additional Bayyinah business tables.

**Important:** The old account migrations have been replaced for the new schema.
Back up any existing database before switching. Applying the new initial migration
to the old database is not a safe data-preserving upgrade; it is intended for a
new, empty database after you explicitly decide to reset the old one. The migration
does not import existing employee data.

Run the migrations and start Django:

```powershell
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

In a second terminal, install frontend dependencies and start Vite:

```powershell
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173/>.

## Tests and build

From the project root:

```powershell
.\venv\Scripts\python.exe manage.py test accounts.tests
```

From the `frontend` directory:

```powershell
npm run build
```

## Database and privacy

Commit the Django models and migrations to share the database structure. Local database files, SQL exports, password hashes, invitation links, and credentials are intentionally excluded. Create a separate PostgreSQL database for each developer and configure its connection through environment variables.

The example addresses in automated tests are placeholders; do not use real employee data in tests or commit database exports containing personal information.
