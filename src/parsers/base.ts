export class ParserError extends Error {
  constructor(
    message: string,
    public readonly parserName: string,
    public readonly rawOutput: string,
  ) {
    super(message);
    this.name = "ParserError";
  }
}

export interface Parser {
  parse(stdout: string, stderr: string): string;
}
