FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN mkdir -p /app/config

COPY main.py config.py ./
COPY server ./server
COPY services ./services
COPY tools ./tools

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
