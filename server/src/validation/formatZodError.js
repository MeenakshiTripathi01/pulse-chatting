/** Converts a ZodError into `{ fieldName: "first error message" }` for API responses. */
export function formatZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
