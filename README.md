# Bayyinah

Bayyinah is a people-management and employee-onboarding application with role-aware workspaces for HR professionals, managers, and employees. The frontend is built with React and Vite; the backend uses Django REST Framework and PostgreSQL.

## Project structure

- `accounts/` — account, organization, department, invitation, and employee features, including management commands and migrations.
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

Configure email delivery only if you are testing invitation emails:

```powershell
$env:BAYYINAH_EMAIL_HOST_USER = Read-Host "Email address used to send invitations"
$env:BAYYINAH_EMAIL_APP_PASSWORD = Read-Host "Email app password"
```

The existing PostgreSQL `employee` and `department` tables are part of the project's legacy database schema and must exist in the local database. The tracked Django migrations add the organization and onboarding tables; they do not contain employee records or database credentials.

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

Commit the Django models and migrations to share the database structure. Local database files, SQL exports, password hashes, invitation tokens, and credentials are intentionally excluded. Create a separate PostgreSQL database for each developer and configure its connection through environment variables.

The example addresses in automated tests are placeholders; do not use real employee data in tests or commit database exports containing personal information.
