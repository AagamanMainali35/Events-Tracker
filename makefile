ROOT_DIR := /home/momoskar/Documents/Interview-project
BACKEND_DIR := $(ROOT_DIR)/backend
FRONTEND_DIR := $(ROOT_DIR)/frontend

PYTHON = uv run python
MANAGE = $(PYTHON) $(BACKEND_DIR)/manage.py
NPM = npm

runb:
	cd $(BACKEND_DIR) && $(PYTHON) manage.py runserver

runf:
	cd $(FRONTEND_DIR) && $(NPM) run dev


makemigrations:
	 $(MANAGE) makemigrations

migrate:
	 $(MANAGE) migrate

createsuperuser:
	 $(MANAGE) createsuperuser

shell:
	 $(MANAGE) shell

test:
	 $(MANAGE) test

check:
	 $(MANAGE) check