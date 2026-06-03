import { compile, EvalFunction } from 'mathjs';

/**
 * Cache for compiled math expressions to avoid expensive recompilation 
 * during the physics loop.
 */
const expressionCache = new Map<string, EvalFunction>();

/**
 * Normalizes user input for math expressions.
 */
export const normalizeExpression = (raw: string): string =>
  raw
    .replace(/\s+/g, '')
    .replace(/(\d)([xt])/gi, '$1*$2')
    .replace(/([xt])(\d)/gi, '$1*$2')
    .replace(/(\d)(sin|cos|tan|sqrt|abs|min|max|pow)/gi, '$1*$2')
    .replace(/([xt])(?=sin|cos|tan|sqrt|abs|min|max|pow)/gi, '$1*');

/**
 * Compiles an expression and caches it.
 */
export const getCompiledExpression = (raw: string): EvalFunction | null => {
  const normalized = normalizeExpression(raw || '0');
  if (!normalized || normalized.length > 100) return null;

  if (expressionCache.has(normalized)) {
    return expressionCache.get(normalized)!;
  }

  // Security: Only allow specific identifiers
  const identifiers = normalized.match(/[a-zA-Z_]\w*/g) ?? [];
  const allowed = new Set(['x', 't', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'min', 'max', 'pow', 'pi', 'e']);
  if (identifiers.some((id) => !allowed.has(id.toLowerCase()))) {
    console.warn(`[Math] Expression contains forbidden identifiers: ${normalized}`);
    return null;
  }

  try {
    const compiled = compile(normalized);
    expressionCache.set(normalized, compiled);
    return compiled;
  } catch (err) {
    console.error(`[Math] Failed to compile expression: ${normalized}`, err);
    return null;
  }
};

/**
 * Evaluates a pre-compiled or raw expression with a scope.
 */
export const evaluatePhysicsExpression = (
  expression: string | EvalFunction, 
  scope: { x: number; t: number }
): number => {
  const compiled = typeof expression === 'string' ? getCompiledExpression(expression) : expression;
  if (!compiled) return 0;

  try {
    const result = compiled.evaluate({
      ...scope,
      pi: Math.PI,
      e: Math.E
    });
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
};

/**
 * Linear interpolation between two numbers.
 */
export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * Math.max(0, Math.min(1, t));
};

/**
 * Linear interpolation between two vectors.
 */
export const lerpVector = (start: Matter.Vector, end: Matter.Vector, t: number): Matter.Vector => ({
  x: lerp(start.x, end.x, t),
  y: lerp(start.y, end.y, t)
});
