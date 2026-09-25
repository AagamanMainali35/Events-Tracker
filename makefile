ROOT_DIR := /home/momoskar/Documents/Interview-project
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

UV := uv run
NPM := npm

.PHONY: runb runf makemigrations migrate downgrade test lint

# Start FastAPI backend
runb:
	cd $(BACKEND_DIR) && $(UV) uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start Frontend
runf:
	cd $(FRONTEND_DIR) && $(NPM) run dev

# Generate Alembic migration (Usage: make makemigrations m="migration message")
makemigrations:
	cd $(BACKEND_DIR) && $(UV) alembic revision --autogenerate -m "$${m:-auto_migration}"

# Apply Alembic migrations
migrate:
	cd $(BACKEND_DIR) && $(UV) alembic upgrade head

# Rollback one migration
downgrade:
	cd $(BACKEND_DIR) && $(UV) alembic downgrade -1

# Run tests
test:
	cd $(BACKEND_DIR) && $(UV) pytest

# Lint and format check
lint:
	cd $(BACKEND_DIR) && $(UV) ruff check .