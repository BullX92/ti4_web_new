#!/bin/sh
set -eu

public_config=$(jq -cn --arg clientId "${DISCORD_CLIENT_ID:-}" \
    --arg redirectUri "${DISCORD_REDIRECT_URI:-}" \
    '{discordClientId: $clientId, discordRedirectUri: $redirectUri}')
printf 'window.__TI4_WRAPPER_CONFIG__ = %s;\n' "$public_config" > /usr/share/nginx/html/runtime-config.js
