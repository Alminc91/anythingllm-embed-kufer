import { forwardRef, memo, useState } from "react";
import { Warning, CircleNotch, CaretDown } from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import { embedderSettings } from "@/main";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { formatDate } from "@/utils/date";

const ThinkingIndicator = ({ hasThought }) => {
  if (hasThought) {
    return (
      <div className="allm-flex allm-items-center allm-gap-x-2 allm-text-gray-500">
        <CircleNotch size={16} className="allm-animate-spin" />
        <span className="allm-text-sm">Thinking...</span>
      </div>
    );
  }
  return <div className="allm-mx-4 allm-my-1 allm-dot-falling"></div>;
};

const ThoughtBubble = ({ thought }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!thought || !embedderSettings.settings.showThoughts) return null;

  const cleanThought = thought.replace(/<\/?think>/g, "").trim();

  return (
    <div className="allm-mb-2">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="allm-cursor-pointer allm-flex allm-items-center allm-gap-x-1.5 allm-text-gray-400 hover:allm-text-gray-500"
      >
        <CaretDown
          size={14}
          weight="bold"
          className={`allm-transition-transform ${isExpanded ? "allm-rotate-180" : ""}`}
        />
        <span className="allm-text-xs allm-font-medium">View thoughts</span>
      </div>
      {isExpanded && (
        <div className="allm-mt-2 allm-mb-3 allm-pl-0 allm-border-l-2 allm-border-gray-200">
          <div className="allm-text-xs allm-text-gray-600 allm-font-mono allm-whitespace-pre-wrap">
            {cleanThought}
          </div>
        </div>
      )}
    </div>
  );
};

const PromptReply = forwardRef(
  ({ uuid, reply, pending, error, sources = [], sentAt }, ref) => {
    if (!reply && sources.length === 0 && !pending && !error) return null;
    if (error) console.error(`ANYTHING_LLM_CHAT_WIDGET_ERROR: ${error}`);

    // Extract content between think tags if they exist
    const thinkMatches = reply?.match(/<think>([\s\S]*?)<\/think>/g) || [];
    const thoughts = thinkMatches.map((match) =>
      match.replace(/<\/?think>/g, "").trim(),
    );

    const hasIncompleteThinkTag =
      reply?.includes("<think>") && !reply?.includes("</think>");

    // For incomplete think tags during streaming, extract the content after the opening tag
    const streamingThought = hasIncompleteThinkTag
      ? reply
          ?.split("<think>")
          .pop()
          ?.replace(/<\/?think>/g, "")
          .trim()
      : null;

    const lastThought = streamingThought || thoughts[thoughts.length - 1];
    const isThinking = hasIncompleteThinkTag || pending;

    // Get the response content without the think tags - clean more aggressively
    const responseContent = reply
      ?.replace(/<think>[\s\S]*?<\/think>/g, "") // Remove complete think blocks
      .replace(/<think>.*$/g, "") // Remove any incomplete think blocks at the end
      .replace(/<\/?think>/g, "") // Remove any stray think tags
      .trim();

    if (isThinking) {
      return (
        <div className="allm-py-[5px]">
          <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mb-2 allm-text-left allm-font-sans">
            {embedderSettings.settings.assistantName ||
              "Anything LLM Chat Assistant"}
          </div>
          <div className="allm-flex allm-items-start allm-w-full allm-h-fit allm-justify-start">
            <img
              src={embedderSettings.settings.assistantIcon || AnythingLLMIcon}
              alt="Anything LLM Icon"
              className="allm-w-9 allm-h-9 allm-flex-shrink-0 allm-ml-2"
            />
            <div
              style={{
                wordBreak: "break-word",
                backgroundColor: embedderSettings.ASSISTANT_STYLES.msgBg,
              }}
              className={`allm-py-[11px] allm-px-4 allm-flex allm-flex-col ${embedderSettings.ASSISTANT_STYLES.base} allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
            >
              {hasIncompleteThinkTag && streamingThought && (
                <ThoughtBubble thought={streamingThought} />
              )}
              <ThinkingIndicator hasThought={hasIncompleteThinkTag} />
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="allm-py-[5px]">
          <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mb-2 allm-text-left allm-font-sans">
            {embedderSettings.settings.assistantName ||
              "Anything LLM Chat Assistant"}
          </div>
          <div className="allm-flex allm-items-start allm-w-full allm-h-fit allm-justify-start">
            <img
              src={embedderSettings.settings.assistantIcon || AnythingLLMIcon}
              alt="Anything LLM Icon"
              className="allm-w-9 allm-h-9 allm-flex-shrink-0 allm-ml-2"
            />
            <div className="allm-py-[11px] allm-px-4 allm-rounded-lg allm-flex allm-flex-col allm-bg-amber-100 allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)] allm-mr-[37px] allm-ml-[9px]">
              <div className="allm-flex allm-gap-x-5">
                <span className="allm-inline-block allm-p-2 allm-rounded-lg allm-bg-amber-50 allm-text-amber-700">
                  <Warning className="allm-h-4 allm-w-4 allm-mb-1 allm-inline-block" />{" "}
                  Unser Chatbot ist vorübergehend nicht verfügbar.
                  <br />
                  <span className="allm-text-xs">Bitte versuchen Sie es später erneut.</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="allm-py-[5px]">
        <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mb-2 allm-text-left allm-font-sans">
          {embedderSettings.settings.assistantName ||
            "Anything LLM Chat Assistant"}
        </div>
        <div
          key={uuid}
          ref={ref}
          className="allm-flex allm-items-start allm-w-full allm-h-fit allm-justify-start"
        >
          <img
            src={embedderSettings.settings.assistantIcon || AnythingLLMIcon}
            alt="Anything LLM Icon"
            className="allm-w-9 allm-h-9 allm-flex-shrink-0 allm-ml-2"
          />
          <div
            style={{
              wordBreak: "break-word",
              backgroundColor: embedderSettings.ASSISTANT_STYLES.msgBg,
            }}
            className={`allm-py-[11px] allm-px-4 allm-flex allm-flex-col ${embedderSettings.ASSISTANT_STYLES.base} allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
          >
            {thoughts.length > 0 && (
              <ThoughtBubble thought={thoughts.join("\n\n")} />
            )}
            <div className="allm-flex allm-gap-x-5">
              <span
                className="allm-font-sans allm-reply allm-whitespace-pre-line allm-font-normal allm-text-sm allm-md:text-sm allm-flex allm-flex-col allm-gap-y-1"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(responseContent || ""),
                }}
              />
            </div>
          </div>
        </div>
        {sentAt && (
          <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mt-2 allm-text-left allm-font-sans">
            {formatDate(sentAt)}
          </div>
        )}
      </div>
    );
  },
);

export default memo(PromptReply);
