/** Shared data contract; no path authority or filesystem access in the browser. */
export interface ComposerFileValidation {
  readonly value:string;
  readonly status:"valid"|"missing"|"unavailable";
}
export const COMPOSER_REFERENCE_LIMIT=100;
export function validReferencePaths(value:unknown):value is readonly string[] {
  return Array.isArray(value) && value.length<=COMPOSER_REFERENCE_LIMIT && value.every(path=>typeof path==="string" && path.length>0 && path.length<=4092 && ![...path].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127));
}
