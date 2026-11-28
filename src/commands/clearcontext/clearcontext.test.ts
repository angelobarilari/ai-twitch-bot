import assert from "node:assert/strict";
import { test } from "node:test";
import { createClearContextCommand } from "./index.js";
import { conversationKey } from "../shared/conversation-key.js";
import { createConversationContext } from "../../ai/context.js";

test("clearcontext validates arguments and deletes only the caller's channel session", async () => {
  const store = createConversationContext();
  const replies: string[] = [];
  const key = conversationKey("channel", { "user-id": "1" })!;
  const session = store.begin(key);
  session.append("q", "a");
  const other = store.begin("other");
  other.append("q", "a");
  const command = createClearContextCommand(store);
  const context = {
    channel: "channel",
    tags: { "user-id": "1" },
    args: ["extra"],
    text: "",
    reply: async (text: string) => {
      replies.push(text);
    },
  };
  await command(context);
  assert.equal(session.read().length, 1);
  await command({ ...context, args: [] });
  assert.deepEqual(session.read(), []);
  assert.equal(other.read().length, 1);
  await command({ ...context, tags: {}, args: [] });
  assert.equal(replies.length, 3);
  assert.equal(conversationKey("CHANNEL", { username: "Viewer" }), "channel:name:viewer");
  assert.equal(conversationKey("channel", { username: "bad name", "user-id": "0" }), null);
});
