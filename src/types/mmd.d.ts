declare module 'mmd-parser' {
  export class Parser {
    parsePmd(buffer: ArrayBuffer, leftToRight?: boolean): any;
    parsePmx(buffer: ArrayBuffer, leftToRight?: boolean): any;
    parseVmd(buffer: ArrayBuffer, leftToRight?: boolean): any;
    parseVpd(buffer: ArrayBuffer, isLoosely?: boolean): any;
    mergeVmds(vmds: any[]): any;
  }
  export const MMDParser: {
    Parser: typeof Parser;
    CharsetEncoder: any;
  };
}
