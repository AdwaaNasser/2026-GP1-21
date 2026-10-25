# Bayyinah

Bayyinah is a people-management and employee-onboarding application with role-aware workspaces for HR professionals, managers, and employees. It is designed mainly for Small and Medium-sized Enterprises (SMEs) in Saudi Arabia. Its goal is to combine daily work tracking with employee well-being in one system, helping HR professionals and managers detect burnout risk early and make better decisions.


## Technologies Used

	•	Languages: Python, JS, html, css
	•	Frontend: React, Vite
	•	Backend: Django, Django REST Framework
	•	Database: PostgreSQL
	•	Tools: Git & GitHub, Visual Studio Code
  

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

