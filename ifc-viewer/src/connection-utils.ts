import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry";
import { IFCModel } from "./types";

interface IntersectionResult {
  type: "point" | "line" | "surface";
  measurements: {
    area?: number;
    length?: number;
  };
  geometry: {
    points?: THREE.BufferGeometry;
    lines?: THREE.BufferGeometry;
    surface?: THREE.BufferGeometry;
  };
}

export class FastIntersectionDetector {
  private raycaster: THREE.Raycaster;
  private tempMatrix: THREE.Matrix4;
  private meshes: THREE.Mesh[];

  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.meshes = [];
  }

  public setupBoundingBoxes(model: IFCModel): void {
    // Store meshes for intersection testing
    this.meshes = [];
    model.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        this.meshes.push(object as THREE.Mesh);
      }
    });
  }

  public async findIntersection(
    obj1: THREE.Object3D,
    obj2: THREE.Object3D
  ): Promise<any> {
    // Get all meshes from both elements
    const meshesA: THREE.Mesh[] = [];
    const meshesB: THREE.Mesh[] = [];

    obj1.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
        meshesA.push(child as THREE.Mesh);
      }
    });

    obj2.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
        meshesB.push(child as THREE.Mesh);
      }
    });

    if (meshesA.length === 0 || meshesB.length === 0) return null;

    // Quick AABB check first
    const boxA = new THREE.Box3().setFromObject(obj1);
    const boxB = new THREE.Box3().setFromObject(obj2);

    if (!boxA.intersectsBox(boxB)) return null;

    // Check intersections between all mesh pairs
    const allIntersectionPoints: THREE.Vector3[] = [];

    for (const meshA of meshesA) {
      for (const meshB of meshesB) {
        const intersectionPoints = this.raycastIntersection(meshA, meshB);
        if (intersectionPoints && intersectionPoints.length > 0) {
          allIntersectionPoints.push(...intersectionPoints);
        }
      }
    }

    if (allIntersectionPoints.length === 0) return null;

    return this.createIntersectionVisualization(allIntersectionPoints);
  }

  private raycastIntersection(
    meshA: THREE.Mesh,
    meshB: THREE.Mesh
  ): THREE.Vector3[] {
    if (!meshA.geometry || !meshB.geometry) return [];

    const intersectionPoints: THREE.Vector3[] = [];
    const v = new THREE.Vector3();
    const positionA = meshA.geometry.attributes.position;

    // Define ray directions
    const rayDirections = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    // Sample vertices
    const stride = Math.max(1, Math.floor(positionA.count / 100)); // Sample up to 100 points

    for (let i = 0; i < positionA.count; i += stride) {
      v.fromBufferAttribute(positionA, i);
      v.applyMatrix4(meshA.matrixWorld);

      for (const direction of rayDirections) {
        this.raycaster.set(v, direction);
        const intersects = this.raycaster.intersectObject(meshB);

        if (intersects.length > 0) {
          intersectionPoints.push(intersects[0].point.clone());
        }
      }
    }

    return intersectionPoints;
  }

  private createIntersectionVisualization(points: THREE.Vector3[]): any {
    if (points.length === 0) return null;

    // Remove duplicate points and filter NaN values
    const uniquePoints: THREE.Vector3[] = [];
    const threshold = 0.01; // 1cm threshold

    for (const point of points) {
      if (isNaN(point.x) || isNaN(point.y) || isNaN(point.z)) continue;

      let isDuplicate = false;
      for (const uniquePoint of uniquePoints) {
        if (point.distanceTo(uniquePoint) < threshold) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        uniquePoints.push(point);
      }
    }

    if (uniquePoints.length < 3) return null;

    // Create point cloud
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        uniquePoints.flatMap((p) => [p.x, p.y, p.z]),
        3
      )
    );

    // Create hull geometry
    let surfaceGeometry: THREE.BufferGeometry;
    try {
      surfaceGeometry = new ConvexGeometry(uniquePoints);
      surfaceGeometry.computeVertexNormals();
      surfaceGeometry.computeBoundingSphere();
    } catch (error) {
      console.warn("Failed to create convex hull, falling back to point cloud");
      surfaceGeometry = pointsGeometry.clone();
    }

    return {
      type: this.classifyIntersectionType(uniquePoints),
      points: pointsGeometry,
      surface: surfaceGeometry,
      measurements: this.calculateMeasurements(uniquePoints),
    };
  }

  private classifyIntersectionType(points: THREE.Vector3[]): string {
    if (points.length <= 2) return "point";
    if (points.length <= 4) return "line";
    return "surface";
  }

  private calculateMeasurements(points: THREE.Vector3[]): any {
    if (points.length <= 1) {
      return { area: 0, length: 0 };
    }

    // Calculate length as total distance between consecutive points
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += points[i].distanceTo(points[i + 1]);
    }

    // Calculate approximate area if we have enough points
    let area = 0;
    if (points.length > 2) {
      // Use the first point as reference and calculate triangles
      const p0 = points[0];
      for (let i = 1; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const v1 = new THREE.Vector3().subVectors(p1, p0);
        const v2 = new THREE.Vector3().subVectors(p2, p0);
        area += v1.cross(v2).length() / 2;
      }
    }

    return { area, length };
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
      surface: "#3366ff",
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
      opacity: 0.5,
    });

    switch (type) {
      case "surface":
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
        return mesh;
      default:
        return null;
    }
  }

  public visualize(data: any): any {
    if (!data || !data.points) return null;

    const visualization: any = {};

    // Create points visualization
    const pointsMaterial = new THREE.PointsMaterial({
      color: this.colors.point,
      size: 0.1,
      transparent: true,
      opacity: 0.8,
    });
    visualization.points = new THREE.Points(data.points, pointsMaterial);

    // Create surface visualization
    if (data.surface) {
      const surfaceMaterial = new THREE.MeshPhongMaterial({
        color: this.colors.surface,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        flatShading: true,
      });

      visualization.surface = new THREE.Mesh(data.surface, surfaceMaterial);

      // Create wireframe using EdgesGeometry instead of WireframeGeometry
      const edges = new THREE.EdgesGeometry(data.surface);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: this.colors.surface,
        transparent: true,
        opacity: 0.5,
      });
      visualization.wireframe = new THREE.LineSegments(
        edges,
        wireframeMaterial
      );
    }

    // Add all visualizations to scene
    this.scene.add(visualization.points);
    if (visualization.surface) {
      this.scene.add(visualization.surface);
      this.scene.add(visualization.wireframe);
    }

    return visualization;
  }

  public highlight(visualization: any): void {
    if (!visualization) return;

    // Highlight points
    if (visualization.points) {
      (visualization.points.material as THREE.PointsMaterial).size = 0.15;
      (visualization.points.material as THREE.PointsMaterial).opacity = 1;
    }

    // Highlight lines
    if (visualization.lines) {
      (visualization.lines.material as THREE.LineBasicMaterial).opacity = 1;
    }

    // Highlight surface
    if (visualization.surface) {
      (visualization.surface.material as THREE.MeshBasicMaterial).opacity = 0.5;
      if (visualization.wireframe) {
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).opacity = 0.8;
      }
    }
  }

  public unhighlight(visualization: any): void {
    if (!visualization) return;

    // Reset points
    if (visualization.points) {
      (visualization.points.material as THREE.PointsMaterial).size = 0.1;
      (visualization.points.material as THREE.PointsMaterial).opacity = 0.8;
    }

    // Reset lines
    if (visualization.lines) {
      (visualization.lines.material as THREE.LineBasicMaterial).opacity = 0.8;
    }

    // Reset surface
    if (visualization.surface) {
      (visualization.surface.material as THREE.MeshBasicMaterial).opacity = 0.3;
      if (visualization.wireframe) {
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).opacity = 0.5;
      }
    }
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
