import { embedderSettings } from "@/main";
import { MESSAGE_NAME_CLASS } from "@/utils/theme";

// Name des Assistenten über einer Antwort (PromptReply, HistoricalMessage
// und der Block mit Kurskarten oben)
export default function AssistantName() {
  return (
    <div className={MESSAGE_NAME_CLASS}>
      {embedderSettings.settings.assistantName || "Anything LLM Chat Assistant"}
    </div>
  );
}
