import { pageHead } from "@/lib/seo";
import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Saved beds live inside Beds now (the heart filter). This route is kept so
 * bookmarks, notifications and older links still land on the right list.
 */
export const Route = createFileRoute("/saved")({
  head: () => pageHead("Saved beds", { noindex: true }),
  beforeLoad: () => {
    throw redirect({
      to: "/search",
      search: {
        city: "",
        locality: "",
        maxRent: "",
        roomType: "",
        furnished: "",
        gender: "",
        food: "",
        kind: "",
        sort: "recommended",
        q: "",
        availableBy: "",
        saved: "1",
      },
      replace: true,
    });
  },
});
