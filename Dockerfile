FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Copy all files to the container
COPY . /app/

# Hugging Face sets the PORT environment variable to 7860 by default
ENV PORT=7860
EXPOSE 7860

# Ensure the database file has the right permissions if it exists
RUN chmod 777 /app || true

# Run the python server
CMD ["python", "api_server.py"]
