import * as THREE from "three";
import { IFCModel } from "./types";

interface IntersectionResult {
  type: "point" | "line" | "surface";
  measurements: {
    area?: number;
    length?: number;
  };
  geometry: {
    points?: THREE.Vector3[];
    lines?: THREE.Vector3[];
    surface?: THREE.BufferGeometry;
  };
}

export class FastIntersectionDetector {
  private boundingBoxes: Map<number, THREE.Box3>;

  constructor() {
    this.boundingBoxes = new Map();
  }

  public setupBoundingBoxes(model: IFCModel): void {
    model.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const box = new THREE.Box3().setFromObject(mesh);
        this.boundingBoxes.set(mesh.id, box);
      }
    });
  }

  public async findIntersection(obj1: THREE.Object3D, obj2: THREE.Object3D): Promise<IntersectionResult | null> {
    try {
      const mesh1 = this.findFirstMesh(obj1);
      const mesh2 = this.findFirstMesh(obj2);

      if (!mesh1 || !mesh2) return null;

      const box1 = this.boundingBoxes.get(mesh1.id);
      const box2 = this.boundingBoxes.get(mesh2.id);

      if (!box1 || !box2) return null;

      // Check if bounding boxes intersect
      if (box1.intersectsBox(box2)) {
        return this.computeIntersection(mesh1, mesh2, box1, box2);
      }

      return null;
    } catch (error) {
      console.error("Error finding intersection:", error);
      return null;
    }
  }

  private findFirstMesh(object: THREE.Object3D): THREE.Mesh | null {
    let mesh: THREE.Mesh | null = null;
    object.traverse((child) => {
      if (!mesh && (child as THREE.Mesh).isMesh) {
        mesh = child as THREE.Mesh;
      }
    });
    return mesh;
  }

  private computeIntersection(
    mesh1: THREE.Mesh, 
    mesh2: THREE.Mesh, 
    box1: THREE.Box3, 
    box2: THREE.Box3
  ): IntersectionResult | null {
    // Compute intersection box
    const intersection = new THREE.Box3();
    intersection.copy(box1).intersect(box2);

    // Get intersection dimensions
    const size = new THREE.Vector3();
    intersection.getSize(size);

    // Calculate area (use largest face)
    const area = Math.max(
      size.x * size.y,
      size.y * size.z,
      size.x * size.z
    );

    // Create visualization geometry
    const geometry = new THREE.BoxGeometry(
      size.x || 0.1, 
      size.y || 0.1, 
      size.z || 0.1
    );

    // Center the geometry
    const center = new THREE.Vector3();
    intersection.getCenter(center);
    geometry.translate(center.x, center.y, center.z);

    return {
      type: "surface",
      measurements: {
        area: area
      },
      geometry: {
        surface: geometry
      }
    };
  }
}

export class IntersectionVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  public colors: Record<string, string>;
  public showLabelsGlobal: boolean;
  private activeMode: boolean;
  private visualizations: Map<string, any>;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.colors = {
      point: "#ff3366",
      line: "#33ff66",
      surface: "#3366ff"
    };
    this.showLabelsGlobal = false;
    this.activeMode = false;
    this.visualizations = new Map();
  }

  public setConnectionMode(active: boolean): void {
    this.activeMode = active;
    this.updateVisibility();
  }

  public createVisualization(type: string, data: any): any {
    const visualization = this.createVisualGeometry(type, data);
    if (visualization) {
      this.visualizations.set(data.id, visualization);
      this.scene.add(visualization);
    }
    return visualization;
  }

  private createVisualGeometry(type: string, data: any): THREE.Object3D | null {
    // Create a simple visualization for now
    const material = new THREE.MeshBasicMaterial({ 
      color: this.colors[type],
      transparent: true,
      opacity: 0.5 
    });

    switch (type) {
      case "surface":
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          material
        );
        return mesh;
      default:
        return null;
    }
  }

  public highlight(visualization: any): void {
    // Implement highlight logic
  }

  public showLabels(visualization: any): void {
    // Implement label showing logic
  }

  public updateLabels(): void {
    // Implement label update logic
  }

  public clear(): void {
    this.visualizations.forEach((vis) => {
      this.scene.remove(vis);
    });
    this.visualizations.clear();
  }

  private updateVisibility(): void {
    this.visualizations.forEach((vis) => {
      vis.visible = this.activeMode;
    });
  }
}
