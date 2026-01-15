import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerTools } from "../src/tools/register-tools.js";
import { clearAllToolSets, getToolSet, getToolSetCount } from "../src/sessions.js";

describe("registerTools", () => {
  beforeEach(() => {
    clearAllToolSets();
  });

  afterEach(() => {
    clearAllToolSets();
  });

  it("registers a tool set and returns the ID", async () => {
    const result = await registerTools({
      tools: [
        { name: "web_fetch", description: "Fetch a URL" },
        { name: "file_read", description: "Read a file" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.toolSetId).toBeDefined();
    expect(result.data?.toolCount).toBe(2);
    expect(result.data?.toolNames).toEqual(["web_fetch", "file_read"]);
  });

  it("uses custom toolSetId when provided", async () => {
    const result = await registerTools({
      tools: [{ name: "test_tool" }],
      toolSetId: "my-custom-id",
    });

    expect(result.success).toBe(true);
    expect(result.data?.toolSetId).toBe("my-custom-id");

    // Verify it's stored
    const toolSet = getToolSet("my-custom-id");
    expect(toolSet).toBeDefined();
    expect(toolSet?.tools[0].name).toBe("test_tool");
  });

  it("stores tool parameters correctly", async () => {
    const result = await registerTools({
      tools: [
        {
          name: "search",
          description: "Search for something",
          parameters: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results" },
          },
        },
      ],
    });

    expect(result.success).toBe(true);

    const toolSet = getToolSet(result.data!.toolSetId);
    expect(toolSet?.tools[0].parameters).toEqual({
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results" },
    });
  });

  it("overwrites existing tool set with same ID", async () => {
    await registerTools({
      tools: [{ name: "old_tool" }],
      toolSetId: "reusable-id",
    });

    const result = await registerTools({
      tools: [{ name: "new_tool" }],
      toolSetId: "reusable-id",
    });

    expect(result.success).toBe(true);

    const toolSet = getToolSet("reusable-id");
    expect(toolSet?.tools).toHaveLength(1);
    expect(toolSet?.tools[0].name).toBe("new_tool");
  });

  it("registers tool with name only (no description or parameters)", async () => {
    const result = await registerTools({
      tools: [{ name: "simple_tool" }],
    });

    expect(result.success).toBe(true);
    expect(result.data?.toolNames).toEqual(["simple_tool"]);

    const toolSet = getToolSet(result.data!.toolSetId);
    expect(toolSet?.tools[0]).toEqual({ name: "simple_tool" });
  });

  it("supports multiple independent tool sets", async () => {
    const result1 = await registerTools({
      tools: [{ name: "tool_a" }],
      toolSetId: "set-1",
    });

    const result2 = await registerTools({
      tools: [{ name: "tool_b" }, { name: "tool_c" }],
      toolSetId: "set-2",
    });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(getToolSetCount()).toBe(2);

    const set1 = getToolSet("set-1");
    const set2 = getToolSet("set-2");

    expect(set1?.tools).toHaveLength(1);
    expect(set2?.tools).toHaveLength(2);
    expect(set1?.tools[0].name).toBe("tool_a");
    expect(set2?.tools[0].name).toBe("tool_b");
  });

  it("expires tool set after TTL", async () => {
    vi.useFakeTimers();

    const result = await registerTools({
      tools: [{ name: "expiring_tool" }],
      toolSetId: "expiring-set",
    });

    expect(result.success).toBe(true);
    expect(getToolSet("expiring-set")).toBeDefined();

    // Advance time past TTL (30 minutes + 1ms)
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    expect(getToolSet("expiring-set")).toBeUndefined();

    vi.useRealTimers();
  });
});
