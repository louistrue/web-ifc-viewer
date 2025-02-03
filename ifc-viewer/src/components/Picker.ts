import * as THREE from "three";
import { IFCViewer } from "../app";
import { IFCMesh } from "../types";
import {
  IFCRELDEFINESBYPROPERTIES,
  IFCRELASSOCIATESMATERIAL
} from "web-ifc";

export class Picker {
  private viewer: IFCViewer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  public selectedObject: THREE.Object3D | null;
  private highlightMaterial: THREE.Material;
  private prePickMaterial: THREE.Material;
  private prePickObject: THREE.Object3D | null;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObject = null;
    this.prePickObject = null;

    // Material for selected objects
    this.highlightMaterial = new THREE.MeshPhongMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });

    // Material for hover effect
    this.prePickMaterial = new THREE.MeshPhongMaterial({
      color: 0x2196f3,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
  }

  private findElementGroup(object: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = object;
    
    while (current && !current.name.startsWith('Element_')) {
      current = current.parent;
    }
    
    if (!current) {
      console.warn("No element group found");
    }
    
    return current;
  }

  async handleClick(event: MouseEvent): Promise<void> {
    try {
      const rect = (event.target as HTMLElement).getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.viewer.getCamera());

      const meshes: THREE.Mesh[] = [];
      this.viewer.getScene().traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes.push(child as THREE.Mesh);
        }
      });

      const intersects = this.raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const intersectedMesh = intersects[0].object as IFCMesh;
        const elementGroup = this.findElementGroup(intersectedMesh);
        
        if (!elementGroup) {
          return;
        }

        // Reset previous selection
        if (this.selectedObject) {
          this.resetSelection();
        }

        // Set new selection
        this.selectedObject = elementGroup;
        this.highlightSelection();

        await this.displayProperties(elementGroup);
      }
    } catch (error) {
      console.error("Error in handleClick:", error);
    }
  }

  handleMouseMove(event: MouseEvent): void {
    // Calculate mouse position
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.viewer.getCamera());

    // Get all meshes
    const meshes: THREE.Mesh[] = [];
    this.viewer.getScene().traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });

    // Find intersections
    const intersects = this.raycaster.intersectObjects(meshes, false);

    // Reset previous pre-pick state if it's not the selected object
    if (this.prePickObject && this.prePickObject !== this.selectedObject) {
      this.resetPrePick();
    }

    if (intersects.length > 0) {
      const intersectedMesh = intersects[0].object as IFCMesh;
      const elementGroup = this.findElementGroup(intersectedMesh);

      if (elementGroup && elementGroup !== this.selectedObject) {
        // Store pre-pick state
        this.prePickObject = elementGroup;
        elementGroup.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!mesh.userData.originalMaterial) {
              mesh.userData.originalMaterial = mesh.material;
            }
            mesh.material = this.prePickMaterial;
          }
        });
        this.viewer.container.style.cursor = "pointer";
      }
    } else {
      this.resetPrePick();
      this.viewer.container.style.cursor = "default";
    }
  }

  private resetPrePick(): void {
    if (this.prePickObject && this.prePickObject !== this.selectedObject) {
      this.prePickObject.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.userData.originalMaterial && !mesh.userData.isSelected) {
            mesh.material = mesh.userData.originalMaterial;
          }
        }
      });
      this.prePickObject = null;
    }
  }

  private async displayProperties(selected: THREE.Object3D): Promise<void> {
    try {
      const modelID = selected.userData?.modelID ?? null;
      const expressID = selected.userData?.expressID ?? null;

      if (modelID === null || expressID === null || modelID === undefined || expressID === undefined) {
        console.warn("Missing IDs:", { modelID, expressID });
        return;
      }

      try {
        const ifcAPI = this.viewer.getIfcAPI();
        const props = await ifcAPI.GetLine(modelID, expressID, true);

        if (!props) {
          console.warn("No properties found");
          return;
        }

        const psets = await this.getPropertySets(modelID, expressID);
        const materials = await this.getMaterials(modelID, expressID);
        const quantities = await this.getQuantities(modelID, expressID);

        const formattedProps = {
          elementInfo: {
            "IFC Type": props.constructor.name || "Unknown",
            "Global ID": props.GlobalId?.value || "Unknown",
            "Name": props.Name?.value || "Unnamed",
            "Description": props.Description?.value || "No description",
            "Object Type": props.ObjectType?.value || "Unknown",
            "Tag": props.Tag?.value || "No tag",
            "Express ID": expressID,
            "Model ID": modelID
          },
          propertysets: psets || [],
          materials: materials || [],
          quantities: quantities || []
        };

        this.viewer.getPropertiesPanel().displayElementProperties(formattedProps);
      } catch (error) {
        console.error("Error getting IFC properties:", error);
      }
    } catch (error) {
      console.error("Error in displayProperties:", error);
    }
  }

  private formatPsetProperties(properties: any[]): any[] {
    if (!properties) return [];
    const props = Array.isArray(properties) ? properties : [properties];
    
    return props.map(prop => ({
      name: prop.Name?.value || "Unnamed Property",
      value: this.getPropertyValue(prop),
      type: prop.constructor.name
    }));
  }

  private formatMaterialProperties(material: any): any[] {
    const props = [];
    for (const [key, value] of Object.entries(material)) {
      if (!key.startsWith("_") && value !== null && value !== undefined) {
        props.push({
          name: key,
          value: value.value || value,
          type: value.constructor?.name || typeof value
        });
      }
    }
    return props;
  }

  private formatQuantities(quantities: any[]): any[] {
    if (!quantities) return [];
    const quants = Array.isArray(quantities) ? quantities : [quantities];
    
    return quants.map(q => {
      let value;
      let unit = "";

      if (q.LengthValue !== undefined) {
        value = q.LengthValue.value;
        unit = "m";
      } else if (q.AreaValue !== undefined) {
        value = q.AreaValue.value;
        unit = "m²";
      } else if (q.VolumeValue !== undefined) {
        value = q.VolumeValue.value;
        unit = "m³";
      } else if (q.WeightValue !== undefined) {
        value = q.WeightValue.value;
        unit = "kg";
      } else if (q.CountValue !== undefined) {
        value = q.CountValue.value;
      }

      return {
        name: q.Name?.value || "Unnamed Quantity",
        value: value !== undefined ? (unit ? `${value.toFixed(2)} ${unit}` : value) : null,
        type: q.constructor.name
      };
    });
  }

  private getPropertyValue(prop: any): any {
    if (prop.NominalValue) {
      return prop.NominalValue.value;
    } else if (prop.Value) {
      return prop.Value.value;
    } else if (prop.EnumValues) {
      return prop.EnumValues.map((v: any) => v.value).join(", ");
    }
    return null;
  }

  private async getPropertySets(modelID: number, expressID: number): Promise<any[]> {
    const psets = [];
    const ifcAPI = this.viewer.getIfcAPI();

    try {
      // Get relationships
      const relDefinesByProps = await ifcAPI.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES);
      
      for (let i = 0; i < relDefinesByProps.size(); i++) {
        const relID = relDefinesByProps.get(i);
        const rel = await ifcAPI.GetLine(modelID, relID, true);

        if (!rel.RelatedObjects) {
          continue;
        }

        const relatedObjects = Array.isArray(rel.RelatedObjects) 
          ? rel.RelatedObjects 
          : [rel.RelatedObjects];
        
        // Check if this relationship references our element
        for (const relObj of relatedObjects) {
          if (relObj.value === expressID && rel.RelatingPropertyDefinition) {
            const pset = await ifcAPI.GetLine(modelID, rel.RelatingPropertyDefinition.value, true);
            if (pset) {
              if (pset.HasProperties) {
                psets.push(pset);
              } else if (pset.Quantities) {
                psets.push(pset);
              }
            }
          }
        }
      }

      return psets;
    } catch (error) {
      console.error("Error in getPropertySets:", error);
      throw error;
    }
  }

  private async getMaterials(modelID: number, expressID: number): Promise<any[]> {
    const materials = [];
    const ifcAPI = this.viewer.getIfcAPI();

    // Get material relationships
    const relMaterials = await ifcAPI.GetLineIDsWithType(modelID, IFCRELASSOCIATESMATERIAL);
    
    for (let i = 0; i < relMaterials.size(); i++) {
      const relID = relMaterials.get(i);
      const rel = await ifcAPI.GetLine(modelID, relID);

      if (!rel.RelatedObjects) continue;

      const relatedObjects = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
      
      // Check if this relationship references our element
      for (const relObj of relatedObjects) {
        if (relObj.value === expressID && rel.RelatingMaterial) {
          const material = await ifcAPI.GetLine(modelID, rel.RelatingMaterial.value, true);
          if (material) {
            materials.push(material);
          }
        }
      }
    }

    return materials;
  }

  private async getQuantities(modelID: number, expressID: number): Promise<any[]> {
    const quantities = [];
    const ifcAPI = this.viewer.getIfcAPI();

    // Get quantity relationships
    const relDefinesByProps = await ifcAPI.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES);
    
    for (let i = 0; i < relDefinesByProps.size(); i++) {
      const relID = relDefinesByProps.get(i);
      const rel = await ifcAPI.GetLine(modelID, relID);

      if (!rel.RelatedObjects) continue;

      const relatedObjects = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
      
      // Check if this relationship references our element
      for (const relObj of relatedObjects) {
        if (relObj.value === expressID && rel.RelatingPropertyDefinition) {
          const qset = await ifcAPI.GetLine(modelID, rel.RelatingPropertyDefinition.value, true);
          if (qset && qset.Quantities) {
            quantities.push(qset);
          }
        }
      }
    }

    return quantities;
  }

  private highlightSelection(): void {
    if (!this.selectedObject) return;

    this.selectedObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.userData.originalMaterial) {
          mesh.userData.originalMaterial = mesh.material;
        }
        mesh.material = this.highlightMaterial;
        mesh.userData.isSelected = true;
      }
    });
  }

  private resetSelection(): void {
    if (!this.selectedObject) return;

    this.selectedObject.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.userData.originalMaterial) {
          mesh.material = mesh.userData.originalMaterial;
          delete mesh.userData.isSelected;
        }
      }
    });

    this.selectedObject = null;
  }
}
