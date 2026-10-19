FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN useradd --create-home --uid 10001 hta

COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir .

USER hta

EXPOSE 8000

CMD ["uvicorn", "hta.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
