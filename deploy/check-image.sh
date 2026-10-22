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

assert_cache_control() {
    path=$1
    expected=$2
    expected_status=${3:-200}
    headers=$(docker exec "$container" sh -c 'printf "HEAD %s HTTP/1.0\r\nHost: localhost\r\n\r\n" "$1" | nc -w 5 127.0.0.1 8080' sh "$path")
    if ! printf '%s\n' "$headers" | tr -d '\r' | grep -E "^[[:space:]]*HTTP/[^ ]+ $expected_status " >/dev/null; then
        printf 'Unexpected HTTP status for %s: expected %s\n%s\n' "$path" "$expected_status" "$headers" >&2
        exit 1
    fi
    if ! printf '%s\n' "$headers" | tr -d '\r' | grep -i '^[[:space:]]*Cache-Control:' | grep -F "$expected" >/dev/null; then
        printf 'Unexpected cache policy for %s: expected %s\n%s\n' "$path" "$expected" "$headers" >&2
        exit 1
    fi
}

assert_cache_control / no-store
assert_cache_control /index.html no-store
assert_cache_control /game/cache-policy-check no-store
assert_cache_control /login no-store
assert_cache_control /runtime-config.js no-store
asset=$(docker exec "$container" sh -c 'find /usr/share/nginx/html/assets -name "*.js" -type f | head -n 1')
test -n "$asset"
assert_cache_control "${asset#/usr/share/nginx/html}" 'public, max-age=31536000, immutable'
assert_cache_control /assets/wrapper-cache-check-missing.js no-store 404

public_config=$(docker exec "$container" wget -q -O - http://127.0.0.1:8080/runtime-config.js)
printf '%s' "$public_config" | grep -F '"discordClientId":"1234567890"' >/dev/null
printf '%s' "$public_config" | grep -F '"discordRedirectUri":"https://wrapper.example.invalid/login"' >/dev/null
sentinel=wrapper-oauth-log-sentinel-9271
docker exec "$container" wget -q -O /dev/null \
    --header="Referer: https://wrapper.example.invalid/login?code=$sentinel" \
    "http://127.0.0.1:8080/login?code=$sentinel"
logs=$(docker logs "$container" 2>&1)
if printf '%s\n' "$logs" | grep -F "$sentinel" >/dev/null; then
    printf 'OAuth callback query or Referer leaked into web logs.\n' >&2
    exit 1
fi
printf '%s\n' "$logs" | grep -F 'GET /index.html HTTP/' >/dev/null
printf 'Web image: nginx syntax, non-root startup, health, SPA, cache policies, OAuth log privacy and public runtime settings passed.\n'
