#!/bin/sh
set -eu

image=${1:?Supply the built wrapper web image}
docker run --rm --network none --add-host server:127.0.0.1 "$image" nginx -t

container=$(docker run -d --rm --network none --add-host server:127.0.0.1 \
    -e DISCORD_CLIENT_ID=1234567890 \
    -e DISCORD_REDIRECT_URI=https://wrapper.example.invalid/login "$image")
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT INT TERM

attempt=0
until docker exec "$container" wget -q -O - http://127.0.0.1:8080/health >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 20 ]; then
        docker logs "$container"
        exit 1
    fi
    sleep 1
done

docker exec "$container" sh -c 'test "$(id -u)" != 0'
docker exec "$container" wget -q -O - http://127.0.0.1:8080/login >/dev/null
public_config=$(docker exec "$container" wget -q -O - http://127.0.0.1:8080/runtime-config.js)
printf '%s' "$public_config" | grep -F '"discordClientId":"1234567890"' >/dev/null
printf '%s' "$public_config" | grep -F '"discordRedirectUri":"https://wrapper.example.invalid/login"' >/dev/null
printf 'Web image: nginx syntax, non-root startup, health, SPA and public runtime settings passed.\n'
