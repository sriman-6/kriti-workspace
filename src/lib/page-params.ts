export type SearchParams=Record<string,string|string[]|undefined>;
export function readParam(params:SearchParams,key:string):string|undefined {
  const value=params[key];return typeof value==='string'?value:undefined;
}
