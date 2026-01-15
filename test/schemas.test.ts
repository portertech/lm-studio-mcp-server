import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadModelInputSchema, unloadModelInputSchema, getModelInfoInputSchema } from "../src/tools/index.js";

describe("input schemas", () => {
  describe("loadModelInputSchema", () => {
    it("validates required model field", () => {
      const result = loadModelInputSchema.safeParse({ model: "llama-3.2-3b" });
      expect(result.success).toBe(true);
    });

    it("rejects empty model", () => {
      const result = loadModelInputSchema.safeParse({ model: "" });
      expect(result.success).toBe(false);
    });

    it("validates optional fields", () => {
      const result = loadModelInputSchema.safeParse({
        model: "llama-3.2-3b",
        identifier: "my-model",
        contextLength: 4096,
        evalBatchSize: 512,
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-positive contextLength", () => {
      const result = loadModelInputSchema.safeParse({
        model: "llama-3.2-3b",
        contextLength: 0,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-positive evalBatchSize", () => {
      const result = loadModelInputSchema.safeParse({
        model: "llama-3.2-3b",
        evalBatchSize: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("unloadModelInputSchema", () => {
    it("validates required identifier", () => {
      const result = unloadModelInputSchema.safeParse({ identifier: "my-model" });
      expect(result.success).toBe(true);
    });

    it("rejects empty identifier", () => {
      const result = unloadModelInputSchema.safeParse({ identifier: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("getModelInfoInputSchema", () => {
    it("validates required identifier", () => {
      const result = getModelInfoInputSchema.safeParse({ identifier: "my-model" });
      expect(result.success).toBe(true);
    });

    it("rejects empty identifier", () => {
      const result = getModelInfoInputSchema.safeParse({ identifier: "" });
      expect(result.success).toBe(false);
    });
  });
});
