import { Button, Group, Text, type ButtonProps } from "@/ds";
import { useUser } from "@/api/auth/useUser";
import { IconBrandDiscordFilled } from "@tabler/icons-react";
import { config } from "@/config";
import cx from "clsx";
import hud from "@/shared/ui/hudChrome.module.css";
import { beginDiscordLogin } from "./oauthState";
import { useState } from "react";

/** A link-styled button that starts the Discord OAuth flow. */
export function DiscordAuthButton(props: ButtonProps) {
  const [error, setError] = useState("");
  return (
    <>
      <Button
        {...props}
        disabled={!config.api.discordClientId || props.disabled}
        onClick={() => {
          try {
            window.location.assign(beginDiscordLogin());
          } catch {
            setError(
              "Die Anmeldung konnte nicht gestartet werden. Bitte erneut versuchen.",
            );
          }
        }}
      />
      {!config.api.discordClientId && (
        <small style={{ display: "block" }}>
          Discord-Anmeldung ist noch nicht eingerichtet.
        </small>
      )}
      {error && <small role="alert">{error}</small>}
    </>
  );
}

export function DiscordLogin() {
  const { user, resetUser } = useUser();

  if (!user?.authenticated) {
    return (
      <DiscordAuthButton
        size="xs"
        variant="default"
        className={cx(hud.hudButton, hud.hudButtonDiscord)}
        leftSection={<IconBrandDiscordFilled size={14} />}
      >
        Discord Login
      </DiscordAuthButton>
    );
  }

  return (
    <Group>
      <Text size="xs">{user.name}</Text>
      <Button
        size="xs"
        variant="default"
        className={hud.hudButton}
        onClick={resetUser}
      >
        Logout
      </Button>
    </Group>
  );
}
