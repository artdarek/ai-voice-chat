.PHONY: run setup docker-up docker-down docker-logs

run:
	. .venv/bin/activate && uvicorn main:app --reload --port 8000

setup:
	python3 -m venv .venv
	. .venv/bin/activate && pip install -r requirements.txt
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env — add your OPENAI_API_KEY"; fi

docker-up:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env — add your OPENAI_API_KEY before running again"; exit 1; fi
	docker compose up --build -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f
