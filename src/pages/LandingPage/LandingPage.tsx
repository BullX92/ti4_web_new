import { Link } from "react-router-dom";
import { IconBrandDiscordFilled } from "@tabler/icons-react";
import { useUser } from "@/api/auth/useUser";
import { Button } from "@/ds";
import { DiscordAuthButton } from "@/domains/auth/DiscordLogin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageShell } from "@/layout/PageShell";
import classes from "./OwnLandingPage.module.css";

export default function LandingPage() {
  useDocumentTitle("Eigene Partien · AsyncTI4");
  const { user } = useUser();

  return (
    <PageShell footer mainClassName={classes.page}>
      <div className={classes.wrap}>
        <section className={classes.entry} aria-labelledby="own-games-title">
          <span className={classes.label}>Eigener Spielserver</span>
          <h1 id="own-games-title">Deine Twilight-Imperium-Partien</h1>
          <p>
            Öffne eure Partien auf diesem Server. Melde dich mit dem
            Discord-Konto an, mit dem du auch in eurer Partie spielst.
          </p>
          {user?.authenticated && (
            <p className={classes.account}>
              Angemeldet{user.name ? ` als ${user.name}` : " mit Discord"}.
            </p>
          )}
          <div className={classes.actions}>
            {user?.authenticated ? (
              <Button component={Link} to="/dashboard" size="md">
                Meine Partien
              </Button>
            ) : (
              <DiscordAuthButton
                size="md"
                color="var(--ds-discord)"
                leftSection={<IconBrandDiscordFilled size={16} />}
              >
                Mit Discord anmelden
              </DiscordAuthButton>
            )}
            <Button component={Link} to="/games" size="md" variant="default">
              Partien ansehen
            </Button>
          </div>
        </section>
        <section
          className={classes.help}
          aria-labelledby="getting-started-title"
        >
          <h2 id="getting-started-title">Noch keine eigene Partie?</h2>
          <p>
            Als Administrator kannst du eine Partie mit euren Mitspielern
            anlegen. Anschließend nutzt du die vorhandenen Einrichtungsschritte,
            einschließlich Milty-Draft.
          </p>
          <div className={classes.actions}>
            <Button component={Link} to="/new-game" variant="default">
              Neue Partie anlegen
            </Button>
          </div>
          <p>
            Beispiel: Nutze für die Anmeldung dasselbe Discord-Konto, dem dein
            Sitz in der Partie gehört. So werden dir deine privaten Karten und
            angebotenen Aktionen zugeordnet.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
