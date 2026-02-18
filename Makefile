.PHONY: run setup docker-up docker-stop docker-down docker-restart docker-rebuild deploy deploy-codebase deploy-clean deploy-docker-reload ssh help
.DEFAULT_GOAL := help

# Load .env if it exists
ifneq (,$(wildcard .env))
include .env
export $(shell sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env)
endif

REMOTE_USER        ?= username
REMOTE_HOST        ?= your-server.example.com
REMOTE_PORT        ?= 22
REMOTE_WWW_PATH    ?= /var/www/aichat
REMOTE_TMP_PATH    ?= /root/tmp
REMOTE_ARTIFACT_DIR ?= www-artifact-aichat

## Create venv, install dependencies, copy .env
setup:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r requirements.txt
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env — add your OPENAI_API_KEY before running"; fi

## Run app locally (requires setup first)
run:
	. .venv/bin/activate && uvicorn main:app --reload --port 8000

## Run app locally via Docker
docker-up:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env — add your OPENAI_API_KEY before running again"; exit 1; fi
	docker compose up --build --remove-orphans -d

## Stop Docker containers locally
docker-stop:
	docker compose stop

## Stop and remove Docker containers locally
docker-down:
	docker compose down

## Restart Docker containers locally
docker-restart:
	docker compose restart

## Rebuild and restart Docker containers locally
docker-rebuild: docker-down docker-up

## Deploy codebase + reload Docker on remote server
deploy: deploy-codebase deploy-docker-reload deploy-clean

## Copy codebase to remote server
deploy-codebase:
	@if [ -z "$(REMOTE_HOST)" ] || [ -z "$(REMOTE_WWW_PATH)" ]; then \
		echo "Error: REMOTE_HOST and REMOTE_WWW_PATH must be set (in .env or as make args)"; \
		exit 1; \
	fi
	ssh -t -p "$(REMOTE_PORT)" "$(REMOTE_USER)@$(REMOTE_HOST)" \
		"mkdir -p '$(REMOTE_TMP_PATH)/$(REMOTE_ARTIFACT_DIR)'"
	scp -r -P "$(REMOTE_PORT)" \
		./main.py ./requirements.txt ./docker-compose.yml ./Dockerfile ./Makefile ./README.md ./.env.example ./static \
		"$(REMOTE_USER)@$(REMOTE_HOST):$(REMOTE_TMP_PATH)/$(REMOTE_ARTIFACT_DIR)"
	ssh -t -p "$(REMOTE_PORT)" "$(REMOTE_USER)@$(REMOTE_HOST)" \
		"sudo mkdir -p '$(REMOTE_WWW_PATH)' && \
		sudo rm -rf '$(REMOTE_WWW_PATH)/static' && \
		sudo cp -R '$(REMOTE_TMP_PATH)/$(REMOTE_ARTIFACT_DIR)/.' '$(REMOTE_WWW_PATH)/'"

## Remove temporary deploy folder on remote server
deploy-clean:
	ssh -t -p "$(REMOTE_PORT)" "$(REMOTE_USER)@$(REMOTE_HOST)" \
		"rm -rf '$(REMOTE_TMP_PATH)/$(REMOTE_ARTIFACT_DIR)'"

## Restart Docker containers on remote server
deploy-docker-reload:
	ssh -t -p "$(REMOTE_PORT)" "$(REMOTE_USER)@$(REMOTE_HOST)" \
		"cd '$(REMOTE_WWW_PATH)' && docker compose stop && docker compose up --build --remove-orphans -d"

## Open SSH session to remote server
ssh:
	ssh "$(REMOTE_USER)@$(REMOTE_HOST)" -p "$(REMOTE_PORT)"

## Show available commands
help:
	@echo "Usage: make [command]"
	@echo ""
	@echo "Available commands:"
	@awk '/^##/ { desc = substr($$0, 4) } /^[a-zA-Z_-]+:/ { if (desc) { printf "  %-22s %s\n", substr($$1, 1, length($$1)-1), desc; desc = "" } }' $(MAKEFILE_LIST)
