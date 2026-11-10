import { test, narrate } from "../stories/_support/story";

test("VIDEO-00 pipeline smoke", async ({ flow }) => {
  const f = await flow({ who: "anika" });
  await f.titleCard({ title: "Pipeline check", roles: "Consultant", intro: "This is a short check of the recording pipeline." });
  await f.go("/w/consultant");
  await narrate(f.page, "Anika opens her consultant home.");
  await f.page.waitForTimeout(1500);
  await f.switchTo("omar", "Now we follow Omar, the marketer.");
  await narrate(f.page, "Omar sees his own workspace.");
});
