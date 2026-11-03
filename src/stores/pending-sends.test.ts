import { describe, it, expect } from "vitest";
import { visiblePendingSends, type PendingSend } from "./pending-sends";

const send = (over: Partial<PendingSend>): PendingSend => ({
  localId: "l",
  chatId: "c1",
  text: "hi",
  attachments: [],
  serverMessageId: null,
  ...over,
});

describe("visiblePendingSends", () => {
  it("hides an admitted send as soon as the server list contains its message (never two copies)", () => {
    const sends = [send({ localId: "a", serverMessageId: "m1" }), send({ localId: "b" })];
    expect(visiblePendingSends(sends, "c1", new Set(["m1"])).map((s) => s.localId)).toEqual(["b"]);
  });

  it("keeps an admitted send visible until the refetch brings its message", () => {
    const sends = [send({ localId: "a", serverMessageId: "m1" })];
    expect(visiblePendingSends(sends, "c1", new Set())).toHaveLength(1);
  });

  it("shows only the current chat's sends", () => {
    expect(visiblePendingSends([send({ chatId: "c2" })], "c1", new Set())).toHaveLength(0);
  });
});
