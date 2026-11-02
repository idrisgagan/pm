import type { KeyboardEvent } from "react";

// For fields that save on blur. Enter saves, Escape puts the saved value back
// before leaving, and Shift+Enter adds a line in a textarea.
export const handleEditKeys = (
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  saved: string
) => {
  if (event.key === "Escape") {
    event.currentTarget.value = saved;
    event.currentTarget.blur();
  } else if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.blur();
  }
};
