import ts from "typescript";

function atLeast(version, required) {
  const parts = version.split(".").map(Number);
  const minimum = required.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((parts[i] ?? 0) !== (minimum[i] ?? 0)) return parts[i] > minimum[i];
  }
  return true;
}

// This focused check supplements the official typed Obsidian ESLint rules.
export function hasUnsupportedAwaitedReveal(source, minAppVersion) {
  if (atLeast(minAppVersion, "1.7.2")) return false;
  const file = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
  let unsupported = false;
  function guardVersion(expression) {
    if (ts.isParenthesizedExpression(expression)) return guardVersion(expression.expression);
    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
      && expression.expression.text === "requireApiVersion"
      && expression.arguments[0] && ts.isStringLiteral(expression.arguments[0])) {
      return expression.arguments[0].text;
    }
    return undefined;
  }
  function guarded(node) {
    let child = node;
    for (let parent = child.parent; parent; child = parent, parent = parent.parent) {
      if (ts.isIfStatement(parent) && child === parent.thenStatement) {
        const version = guardVersion(parent.expression);
        if (version && atLeast(version, "1.7.2")) return true;
      }
    }
    return false;
  }
  function unwrap(node) {
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    return node;
  }
  function visit(node) {
    const awaited = ts.isAwaitExpression(node) ? unwrap(node.expression) : undefined;
    if (awaited && ts.isCallExpression(awaited)) {
      const expression = unwrap(awaited.expression);
      const name = ts.isPropertyAccessExpression(expression) ? expression.name.text
        : ts.isElementAccessExpression(expression) && expression.argumentExpression
          && ts.isStringLiteral(expression.argumentExpression) ? expression.argumentExpression.text : "";
      if (name === "revealLeaf" && !guarded(node)) unsupported = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return unsupported;
}
