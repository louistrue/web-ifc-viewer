declare module "web-ifc" {
  export class IfcAPI {
    wasmModule: any;
    constructor();
    Init(): Promise<void>;
    OpenModel(data: Uint8Array, settings?: any): number;
    GetGeometry(modelID: number, geometryExpressID: number): any;
    GetVertexArray(ptr: number, size: number): Float32Array;
    GetIndexArray(ptr: number, size: number): Uint32Array;
    StreamAllMeshes(modelID: number, callback: (mesh: any) => void): void;
    GetLine(modelID: number, expressID: number, flatten?: boolean): any;
    GetLineIDsWithType(
      modelID: number,
      type: number
    ): { get(index: number): number; size(): number };
    dispose(): void;
  }
}
