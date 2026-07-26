export async function getRequestOrigin(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}
