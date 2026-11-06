/** Native builds do not depend on browser hosting or a Web proxy. */
export function webPreviewHostProblem(): string | undefined {
  return undefined;
}
