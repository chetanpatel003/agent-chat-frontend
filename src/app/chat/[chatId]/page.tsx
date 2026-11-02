import { Suspense } from "react";
import { ChatWorkspace } from "@/components/chat/chat-workspace";

async function ChatPageContent({ params }: { params: PageProps<"/chat/[chatId]">["params"] }) {
  const { chatId } = await params;
  return <ChatWorkspace selectedChatId={chatId} />;
}

export default function ChatPage({ params }: PageProps<"/chat/[chatId]">) {
  // `params` is accessed inside ChatPageContent, not here — Next's
  // Cache Components mode (next.config.ts: cacheComponents: true)
  // requires that runtime data access (params included) happen inside
  // a Suspense boundary to allow the surrounding shell to prerender.
  return (
    <Suspense fallback={null}>
      <ChatPageContent params={params} />
    </Suspense>
  );
}
