import { Object3D, Material } from "three";
import { IfcAPI } from "web-ifc";

export interface IFCModel {
  object: Object3D;
  modelID: number;
  expressID?: number;
  name: string;
  visible: boolean;
  ifcAPI?: IfcAPI;
}

export interface IFCElement {
  modelID: number;
  expressID: number;
  type: string;
  name?: string;
  properties?: any;
  object?: Object3D;
}

export interface PropertySet {
  Name: { value: string };
  HasProperties: Array<{
    Name: { value: string };
    NominalValue?: { value: any };
    Value?: { value: any };
  }>;
}

export interface MaterialData {
  Name?: { value: string };
  ForLayerSet?: {
    LayerSetName?: { value: string };
    Description?: { value: string };
    MaterialLayers?: Array<{
      Name?: { value: string };
      Material?: { Name: { value: string } };
      LayerThickness?: { value: number };
      IsVentilated?: boolean;
      Category?: { value: string };
      Priority?: number;
    }>;
  };
}

export interface SpatialElement {
  Name?: { value: string };
  Elevation?: { value: number };
  ContainsElements?: Array<{ value: number }>;
}

export interface TreeItem {
  label: string;
  icon: string;
  modelID: number;
  expressID: number;
  children?: TreeItem[];
}

export interface SelectedObject extends Object3D {
  modelID: number;
  expressID: number;
  material?: Material;
  originalMaterial?: Material;
  isSelected?: boolean;
}

export interface IFCViewerState {
  models: Map<number, IFCModel>;
  selectedObject: SelectedObject | null;
  ifcAPI: IfcAPI | null;
}

export interface TreeNode {
  expressID: number;
  type: string;
  name: string;
  children: TreeNode[];
}
