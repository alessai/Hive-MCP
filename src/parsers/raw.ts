import { Parser } from "./base.js";

export class RawParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    return stdout.trim();
  }
}
