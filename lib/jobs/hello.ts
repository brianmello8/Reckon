import { inngest } from "./client";

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    triggers: [{ event: "test/hello" }],
  },
  async ({ event, step }) => {
    await step.run("say-hello", async () => {
      console.log("hello from inngest");
      return { ok: true };
    });

    return { ok: true, event };
  }
);
