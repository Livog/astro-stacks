import { createStackStore, renderStacksResponse } from "./stacks";

export async function onRequest(
  context: { locals: { stacks: any } },
  next: () => Promise<Response>,
): Promise<Response> {
  context.locals.stacks = createStackStore();
  const response = await next();
  return renderStacksResponse(response, context.locals.stacks);
}
