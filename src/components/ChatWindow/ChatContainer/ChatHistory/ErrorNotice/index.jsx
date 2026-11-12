import { Warning } from "@phosphor-icons/react";
import { embedderSettings } from "@/main";
import { errorNotice } from "@/utils/chatLimits";

// lange Adressen umbrechen statt waagerecht zu laufen ("break-word" als
// Rückfall für Safari vor 15.4, wie Header HEADER_WRAP und CourseCards)
const LINK_WRAP = { overflowWrap: "anywhere", wordBreak: "break-word" };

// Inhalt der Fehlerblase (PromptReply und HistoricalMessage; widget-grenzen-
// kontakt AK-7 bis AK-10, NAK-3, NAK-4): Text nach errorCode der Nachricht
// (utils/chatLimits.js errorNotice), der Kontaktsatz nur mit gültiger E-Mail
// für Besucher. Alles als Text (React), nie als HTML; der Text des Servers
// (error, errorMsg) erscheint nicht. Optik wie die bisherige Fehlerblase:
// Überschrift mit Warnsymbol, darunter klein die übrigen Sätze. Die
// Leerzeichen zwischen den Blöcken halten den Wortlaut im Text der Seite
// (Vorlesen, Kopieren) zusammen. Der Mail-Link hat mindestens 44 px Höhe
// als Trefferfläche (Prüfmatrix §8) und bricht lange Adressen um; sein
// Kasten ersetzt den unteren Rand des Kontaktsatzes (allm-mb-0), so bleibt
// der Abstand unten wie bei der Blase ohne Kontakt.
export default function ErrorNotice({ settings = null, errorCode = null }) {
  const notice = errorNotice(settings || embedderSettings.settings, errorCode);
  return (
    <div
      className="allm-p-2 allm-rounded-lg allm-bg-amber-50 allm-text-amber-700"
      data-error-notice={notice.kind}
    >
      <span className="allm-inline-block">
        <Warning
          aria-hidden="true"
          className="allm-h-4 allm-w-4 allm-mb-1 allm-inline-block"
        />{" "}
        {notice.title}
      </span>
      {notice.details.length > 0 && (
        <>
          {" "}
          <p className="allm-text-xs allm-mt-2">{notice.details.join(" ")}</p>
        </>
      )}
      {notice.contact && (
        <>
          {" "}
          <p className="allm-text-xs allm-mt-2 allm-mb-0">
            {notice.contact.lead}{" "}
            <a
              href={`mailto:${notice.contact.email}`}
              className="allm-inline-flex allm-items-center allm-min-h-[44px] allm-max-w-full allm-font-semibold allm-text-amber-800 allm-underline"
              style={LINK_WRAP}
            >
              {notice.contact.email}
            </a>
          </p>
        </>
      )}
    </div>
  );
}
