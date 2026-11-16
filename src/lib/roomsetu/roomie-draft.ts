import { cleanAnswers, type RoomieAnswers } from "@/lib/roomsetu/roomie-quiz";

/** Unsaved quiz answers live only in this tab (sessionStorage) until the person signs in and consents to save. */
export const ROOMIE_DRAFT_KEY = "roomeo-roomie-draft";

export function readRoomieDraft(): RoomieAnswers {
  try {
    return cleanAnswers(JSON.parse(sessionStorage.getItem(ROOMIE_DRAFT_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function writeRoomieDraft(answers: RoomieAnswers) {
  try {
    sessionStorage.setItem(ROOMIE_DRAFT_KEY, JSON.stringify(answers));
  } catch {
    /* private mode: the quiz still works, it just won't survive a reload */
  }
}

/** /search params for "matching beds, best Vibe match first". */
export function vibeSearch(city: string) {
  return { city, locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "vibe", q: "", availableBy: "" };
}
