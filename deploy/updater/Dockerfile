FROM docker:27-cli
RUN apk add --no-cache git python3
WORKDIR /srv
COPY deploy/updater/updater.py /srv/updater.py
EXPOSE 9000
CMD ["python3", "/srv/updater.py"]
