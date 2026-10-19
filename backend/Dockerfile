FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN useradd --create-home --uid 10001 hta

COPY pyproject.toml ./
COPY src ./src

RUN chmod -R a+rX ./src && pip install --no-cache-dir .

COPY entrypoint.sh ./entrypoint.sh
RUN chmod 755 ./entrypoint.sh

USER hta

EXPOSE 8000

CMD ["./entrypoint.sh"]
