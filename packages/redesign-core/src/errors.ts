/**
 * Typed error carrying the HTTP status code intent from the original Next.js
 * route handlers. The thin route adapter maps `status` -> NextResponse status
 * and `message` -> the JSON `{ error }` body.
 *
 * Original routes returned `NextResponse.json({ error }, { status })` for
 * validation/permission failures (400/403) and 500 for unexpected errors.
 */
export class RedesignError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RedesignError";
    this.status = status;
  }
}
