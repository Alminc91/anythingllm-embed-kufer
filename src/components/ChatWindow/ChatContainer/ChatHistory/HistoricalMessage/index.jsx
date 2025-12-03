import React, { memo, forwardRef, useState } from "react";
import { Warning, CaretDown } from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import { embedderSettings } from "@/main";
import { v4 } from "uuid";
import AnythingLLMIcon from "@/assets/anything-llm-icon.svg";
import { formatDate } from "@/utils/date";

const ThoughtBubble = ({ thought }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!thought || !embedderSettings.settings.showThoughts) return null;

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
            {thought.trim()}
          </div>
        </div>
      )}
    </div>
  );
};

const HistoricalMessage = forwardRef(
  (
    {
      uuid = v4(),
      message,
      role,
      sources = [],
      error = false,
      errorMsg = null,
      sentAt,
    },
    ref,
  ) => {
    const textSize = !!embedderSettings.settings.textSize
      ? `allm-text-[${embedderSettings.settings.textSize}px]`
      : "allm-text-sm";
    if (error) console.error(`ANYTHING_LLM_CHAT_WIDGET_ERROR: ${error}`);

    // Extract content between think tags if they exist
    const thinkMatches = message?.match(/<think>([\s\S]*?)<\/think>/g) || [];
    const thoughts = thinkMatches.map((match) =>
      match.replace(/<think>|<\/think>/g, "").trim(),
    );

    // Get the response content without the think tags
    const responseContent = message
      ?.replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    return (
      <div className="allm-py-[5px]">
        {role === "assistant" && (
          <div className="allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mb-2 allm-text-left allm-font-sans">
            {embedderSettings.settings.assistantName ||
              "Anything LLM Chat Assistant"}
          </div>
        )}
        <div
          key={uuid}
          ref={ref}
          className={`allm-flex allm-items-start allm-w-full allm-h-fit ${
            role === "user" ? "allm-justify-end" : "allm-justify-start"
          }`}
        >
          {role === "assistant" && (
            <img
              src={embedderSettings.settings.assistantIcon || AnythingLLMIcon}
              alt="Anything LLM Icon"
              className="allm-w-9 allm-h-9 allm-flex-shrink-0 allm-ml-2"
              id="anything-llm-icon"
            />
          )}
          <div
            style={{
              wordBreak: "break-word",
              backgroundColor:
                role === "user"
                  ? embedderSettings.USER_STYLES.msgBg
                  : embedderSettings.ASSISTANT_STYLES.msgBg,
            }}
            className={`allm-py-[11px] allm-px-4 allm-flex allm-flex-col allm-font-sans ${
              error
                ? "allm-bg-red-200 allm-rounded-lg allm-mr-[37px] allm-ml-[9px]"
                : role === "user"
                  ? `${embedderSettings.USER_STYLES.base} allm-anything-llm-user-message`
                  : `${embedderSettings.ASSISTANT_STYLES.base} allm-anything-llm-assistant-message`
            } allm-shadow-[0_4px_14px_rgba(0,0,0,0.25)]`}
          >
            <div className="allm-flex allm-flex-col">
              {error ? (
                <div className="allm-p-2 allm-rounded-lg allm-bg-amber-50 allm-text-amber-700">
                  <span className="allm-inline-block">
                    <Warning className="allm-h-4 allm-w-4 allm-mb-1 allm-inline-block" />{" "}
                    Unser Chatbot ist vorübergehend nicht verfügbar.
                  </span>
                  <p className="allm-text-xs allm-mt-2">
                    Bitte versuchen Sie es später erneut.
                  </p>
                </div>
              ) : (
                <>
                  {role === "assistant" && thoughts.length > 0 && (
                    <ThoughtBubble thought={thoughts.join("\n\n")} />
                  )}
                  <span
                    className={`allm-whitespace-pre-line allm-flex allm-flex-col allm-gap-y-1 ${textSize} allm-leading-[20px]`}
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(
                        renderMarkdown(responseContent || message),
                      ),
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {sentAt && (
          <div
            className={`allm-font-sans allm-text-[10px] allm-text-gray-400 allm-ml-[54px] allm-mr-6 allm-mt-2 ${role === "user" ? "allm-text-right" : "allm-text-left"}`}
          >
            {formatDate(sentAt)}
          </div>
        )}
      </div>
    );
  },
);

export default memo(HistoricalMessage);
