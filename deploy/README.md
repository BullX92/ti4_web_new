# Webdienst der eigenen Instanz

Das Image enthält die bestehende Weboberfläche und einen Nginx ohne Root-Rechte. `/api/` und `/ws` werden innerhalb des eigenen Compose-Netzes an `server:8081` weitergeleitet. Die Browseranfragen bleiben dadurch auf derselben eigenen Adresse.

Beim Start entsteht `runtime-config.js` ausschließlich aus den öffentlichen Werten `DISCORD_CLIENT_ID` und `DISCORD_REDIRECT_URI`. Bot-Token, Client Secret und Datenbankpasswort gehören nicht in diesen Dienst. Der Redirect muss genau zu einem Eintrag der eigenen Discord-Anwendung passen. Änderungen dieser beiden öffentlichen Werte brauchen keinen neuen Web-Build.

Der Workflow `Wrapper web` prüft TypeScript, die Wrapper-Regressionen und den Produktionsbuild. Danach baut er das Image und prüft Nginx-Syntax, Start ohne Root, Health, SPA-Routing und die öffentlichen Laufzeiteinstellungen in einem isolierten Container ohne Netzwerk. Erst danach wird das Image mit vollständigem Commit-Tag in `ghcr.io/bullx92/ti4-wrapper-web` veröffentlicht.

Im Compose-Paket des Spielservers `WRAPPER_WEB_IMAGE` auf diesen geprüften Tag setzen und das Profil `web` verwenden:

```sh
docker compose --env-file .env --profile web config --quiet
docker compose --env-file .env --profile web up -d
```

Die vorbereitete Bindung ist nur `127.0.0.1:18082`. Die konkrete Freigabe im Netzwerk wird gesondert entschieden. Ein erfolgreicher Containercheck beweist keine echte angemeldete Partie; diese Abnahme benötigt die eigene Discord-Einrichtung und den tatsächlichen Spielablauf. Die eigene Partienliste und Einrichtung werden in weiteren Schritten angebunden.
