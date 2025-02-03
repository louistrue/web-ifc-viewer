import * as THREE from "three";
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

    // Remove duplicate points and validate
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

    if (uniquePoints.length === 0) return null;

    // Create point cloud geometry
    const pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(
      uniquePoints.flatMap((p) => [p.x, p.y, p.z])
    );
    pointsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    // Create lines geometry
    const linePoints: number[] = [];
    for (let i = 0; i < uniquePoints.length - 1; i++) {
      linePoints.push(
        uniquePoints[i].x,
        uniquePoints[i].y,
        uniquePoints[i].z,
        uniquePoints[i + 1].x,
        uniquePoints[i + 1].y,
        uniquePoints[i + 1].z
      );
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(linePoints, 3)
    );

    // Create surface geometry
    let surfaceGeometry: THREE.BufferGeometry | null = null;
    if (uniquePoints.length >= 3) {
      try {
        // Create triangles for surface
        const vertices: number[] = [];
        const indices: number[] = [];
        const center = new THREE.Vector3();

        // Calculate center point
        uniquePoints.forEach((p) => center.add(p));
        center.divideScalar(uniquePoints.length);

        // Create triangles fan from center
        vertices.push(center.x, center.y, center.z);
        for (let i = 0; i < uniquePoints.length; i++) {
          const point = uniquePoints[i];
          vertices.push(point.x, point.y, point.z);

          if (i > 0) {
            indices.push(
              0, // center point
              i, // current point
              i + 1 > uniquePoints.length ? 1 : i + 1 // next point or wrap to first
            );
          }
        }

        surfaceGeometry = new THREE.BufferGeometry();
        surfaceGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3)
        );
        surfaceGeometry.setIndex(indices);
        surfaceGeometry.computeVertexNormals();

        // Validate geometry
        if (
          !surfaceGeometry.boundingSphere ||
          isNaN(surfaceGeometry.boundingSphere.radius)
        ) {
          surfaceGeometry = null;
        }
      } catch (error) {
        console.warn("Failed to create surface geometry:", error);
        surfaceGeometry = null;
      }
    }

    // Determine type based on geometry
    let type: "point" | "line" | "surface";
    if (uniquePoints.length <= 2) {
      type = "point";
    } else if (!surfaceGeometry || uniquePoints.length <= 4) {
      type = "line";
    } else {
      type = "surface";
    }

    return {
      type,
      points: pointsGeometry,
      lines: lineGeometry,
      surface: surfaceGeometry,
      measurements: this.calculateMeasurements(uniquePoints),
    };
  }

  private calculateMeasurements(points: THREE.Vector3[]): any {
    const measurements: any = {};

    // Calculate length (sum of segments)
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += points[i].distanceTo(points[i + 1]);
    }
    measurements.length = length;

    // Calculate area if we have enough points
    if (points.length >= 3) {
      let area = 0;
      const center = new THREE.Vector3();
      points.forEach((p) => center.add(p));
      center.divideScalar(points.length);

      // Calculate area using triangles from center point
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const v1 = new THREE.Vector3().subVectors(p1, center);
        const v2 = new THREE.Vector3().subVectors(p2, center);
        area += v1.cross(v2).length() / 2;
      }
      measurements.area = area;
    }

    return measurements;
  }
}

export class IntersectionVisualizer {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private lastCameraPosition: THREE.Vector3;
  private lastCameraQuaternion: THREE.Quaternion;
  private updateThreshold: number = 0.01; // Threshold for camera movement
  private animationFrameId: number | null = null;
  public colors: Record<string, string> = {
    surface: "#4CAF50",
    line: "#2196F3",
    point: "#FFC107",
  };
  public showLabelsGlobal: boolean = false;
  private materials: Record<string, any>;
  private activeMode: boolean;
  private visualizations: Map<string, any>;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.lastCameraPosition = camera.position.clone();
    this.lastCameraQuaternion = camera.quaternion.clone();

    // Start continuous camera tracking
    this.startCameraTracking();
    this.setupMaterials();
    this.activeMode = false;
    this.visualizations = new Map();
  }

  private setupMaterials(): void {
    this.materials = {
      point: {
        normal: new THREE.PointsMaterial({
          color: this.colors.point,
          size: 0.05,
          transparent: true,
          opacity: 0.8,
          sizeAttenuation: false,
        }),
        highlight: new THREE.PointsMaterial({
          color: this.colors.point,
          size: 0.1,
          transparent: true,
          opacity: 1,
          sizeAttenuation: false,
        }),
      },
      line: {
        normal: new THREE.LineBasicMaterial({
          color: this.colors.line,
          transparent: true,
          opacity: 0.8,
          linewidth: 1,
        }),
        highlight: new THREE.LineBasicMaterial({
          color: this.colors.line,
          transparent: true,
          opacity: 1,
          linewidth: 2,
        }),
      },
      surface: {
        normal: new THREE.MeshPhongMaterial({
          color: this.colors.surface,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
        highlight: new THREE.MeshPhongMaterial({
          color: this.colors.surface,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          depthWrite: false,
          shininess: 100,
          specular: 0xffffff,
          emissive: this.colors.surface,
          emissiveIntensity: 0.3,
        }),
      },
    };
  }

  private startCameraTracking(): void {
    const checkCameraMovement = () => {
      if (this.showLabelsGlobal) {
        // Check if camera has moved enough
        const positionDelta = this.camera.position.distanceTo(
          this.lastCameraPosition
        );
        const rotationDelta = this.camera.quaternion.angleTo(
          this.lastCameraQuaternion
        );

        if (
          positionDelta > this.updateThreshold ||
          rotationDelta > this.updateThreshold
        ) {
          this.updateLabels();
          // Update last known position/rotation
          this.lastCameraPosition.copy(this.camera.position);
          this.lastCameraQuaternion.copy(this.camera.quaternion);
        }
      }

      this.animationFrameId = requestAnimationFrame(checkCameraMovement);
    };

    checkCameraMovement();
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  public setConnectionMode(active: boolean): void {
    this.activeMode = active;
    this.updateVisibility();
  }

  public createVisualization(data: {
    id: string;
    type: string;
    color: THREE.Color;
    points: THREE.Vector3[];
    lines: THREE.Line3[];
    surface: THREE.BufferGeometry | null;
    measurements?: any;
    elements?: { expressID: number; name?: string }[];
  }): any {
    const visualization: any = {
      id: data.id,
      type: data.type,
    };

    // Create points visualization
    if (data.points.length > 0) {
      const pointGroup = new THREE.Group();
      const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
      const pointMaterial = new THREE.MeshPhongMaterial({
        color: this.colors.point,
        transparent: true,
        opacity: 0.8,
        shininess: 100,
        specular: 0xffffff,
      });

      data.points.forEach((point) => {
        const sphere = new THREE.Mesh(sphereGeometry, pointMaterial);
        sphere.position.copy(point);
        pointGroup.add(sphere);
      });

      visualization.points = pointGroup;
      this.scene.add(pointGroup);
    }

    // Create lines visualization
    if (data.lines.length > 0) {
      const lineGeometry = new THREE.BufferGeometry();
      const positions: number[] = [];

      data.lines.forEach((line) => {
        positions.push(
          line.start.x,
          line.start.y,
          line.start.z,
          line.end.x,
          line.end.y,
          line.end.z
        );
      });

      lineGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );

      const lineMaterial = new THREE.LineBasicMaterial({
        color: this.colors.line,
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
      });

      const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
      visualization.lines = lineSegments;
      this.scene.add(lineSegments);
    }

    // Create surface visualization
    if (data.surface) {
      const surfaceMaterial = new THREE.MeshPhongMaterial({
        color: this.colors.surface,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        shininess: 100,
        specular: 0xffffff,
      });

      const surfaceMesh = new THREE.Mesh(data.surface, surfaceMaterial);
      visualization.surface = surfaceMesh;
      this.scene.add(surfaceMesh);

      // Add wireframe
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: this.colors.surface,
        transparent: true,
        opacity: 0.5,
        linewidth: 2,
      });

      const wireframeGeometry = new THREE.WireframeGeometry(data.surface);
      const wireframe = new THREE.LineSegments(
        wireframeGeometry,
        wireframeMaterial
      );
      visualization.wireframe = wireframe;
      this.scene.add(wireframe);
    }

    // Create label with full data
    const labelText = this.createLabelText(data.type, {
      measurements: data.measurements,
      elements: data.elements,
    });
    if (labelText) {
      const label = this.createLabel(labelText);
      const center = this.calculateCenter(data.points);
      label.position.copy(center);
      label.position.y += 0.1;
      label.visible = this.showLabelsGlobal;
      label.userData.type = "connection-label";
      label.userData.target = center;
      visualization.label = label;
      this.scene.add(label);
    }

    this.visualizations.set(data.id, visualization);
    return visualization;
  }

  private createLabel(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not get canvas context");

    const lines = text.split("\n");
    const lineHeight = 24; // Increased line height
    const padding = 16; // Increased padding

    // Calculate required canvas height based on number of lines
    const height = lines.length * lineHeight + padding * 2;

    // Set canvas size (increased for better resolution)
    canvas.width = 400;
    canvas.height = height;

    // Style the background
    context.fillStyle = "rgba(255, 255, 255, 0.9)"; // More opaque background
    context.strokeStyle = "#666666";
    context.lineWidth = 2;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeRect(0, 0, canvas.width, canvas.height);

    // Style and position each line with larger fonts
    let y = padding + lineHeight / 2;
    lines.forEach((line, index) => {
      context.font = index === 0 ? "bold 28px Arial" : "24px Arial"; // Larger fonts
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#222222"; // Darker text for better contrast
      context.fillText(line, canvas.width / 2, y);
      y += lineHeight;
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; // Better scaling quality
    texture.magFilter = THREE.LinearFilter;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true, // Enable size attenuation
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    // Base scale adjusted for better visibility
    const aspectRatio = height / canvas.width;
    sprite.scale.set(1.0, 1.0 * aspectRatio, 1);
    return sprite;
  }

  private createLabelText(type: string, data: any): string {
    let text = "";

    // Add connection type
    text += type.charAt(0).toUpperCase() + type.slice(1) + " Connection";

    // Add measurements with units
    if (data.measurements) {
      if (type === "surface" && data.measurements.area) {
        text += `\nArea: ${data.measurements.area.toFixed(2)} m²`;
      } else if (type === "line" && data.measurements.length) {
        text += `\nLength: ${data.measurements.length.toFixed(2)} m`;
      }
    }

    // Add elements info if available
    if (data.elements && data.elements.length === 2) {
      const elem1 = data.elements[0];
      const elem2 = data.elements[1];
      text += `\n${elem1.name} ↔ ${elem2.name}`;
    }

    return text;
  }

  private calculateCenter(points: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    points.forEach((point) => center.add(point));
    return center.divideScalar(points.length);
  }

  public highlight(visualization: any): void {
    if (!visualization) return;

    // Highlight points
    if (visualization.points) {
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        (sphere.material as THREE.MeshPhongMaterial).opacity = 1;
        sphere.scale.setScalar(1.5); // Make spheres bigger when highlighted
      });
    }

    // Highlight lines
    if (visualization.lines) {
      (visualization.lines.material as THREE.LineBasicMaterial).opacity = 1;
      (visualization.lines.material as THREE.LineBasicMaterial).linewidth = 3;
    }

    // Highlight surface
    if (visualization.surface) {
      (visualization.surface.material as THREE.MeshPhongMaterial).opacity = 0.5;
      if (visualization.wireframe) {
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).opacity = 0.8;
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).linewidth = 3;
      }
    }
  }

  public unhighlight(visualization: any): void {
    if (!visualization) return;

    // Reset points
    if (visualization.points) {
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        (sphere.material as THREE.MeshPhongMaterial).opacity = 0.8;
        sphere.scale.setScalar(1.0);
      });
    }

    // Reset lines
    if (visualization.lines) {
      (visualization.lines.material as THREE.LineBasicMaterial).opacity = 0.8;
      (visualization.lines.material as THREE.LineBasicMaterial).linewidth = 2;
    }

    // Reset surface
    if (visualization.surface) {
      (visualization.surface.material as THREE.MeshPhongMaterial).opacity = 0.3;
      if (visualization.wireframe) {
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).opacity = 0.5;
        (
          visualization.wireframe.material as THREE.LineBasicMaterial
        ).linewidth = 2;
      }
    }
  }

  public showLabels(visualization: any): void {
    if (visualization.label) {
      visualization.label.visible = true;
    }
  }

  public hideLabels(visualization: any): void {
    if (visualization.label) {
      visualization.label.visible = false;
    }
  }

  public updateLabels(): void {
    if (!this.showLabelsGlobal) return;

    const camera = this.camera;
    const visibleLabels: THREE.Sprite[] = [];
    const minDistance = 0.15;

    // First pass: collect and update all labels
    this.visualizations.forEach((visualization) => {
      if (visualization.label) {
        const label = visualization.label as THREE.Sprite;
        const screenPos = label.position.clone().project(camera);
        screenPos.z = camera.position.distanceTo(label.position);
        visibleLabels.push(label);
        label.userData.screenPos = screenPos;
      }
    });

    // Sort labels by distance to camera (closest first)
    visibleLabels.sort((a, b) => {
      const distA = a.userData.screenPos.z;
      const distB = b.userData.screenPos.z;
      return distA - distB;
    });

    // Second pass: handle visibility and scaling
    visibleLabels.forEach((label, i) => {
      const pos1 = label.userData.screenPos;
      let shouldShow = true;

      // Check overlapping with adjusted distances
      let overlappingCount = 0;
      const maxOverlaps = 2;

      for (let j = 0; j < i; j++) {
        const otherLabel = visibleLabels[j];
        if (otherLabel.visible) {
          const pos2 = otherLabel.userData.screenPos;

          // Consider depth difference
          const depthDiff = Math.abs(pos1.z - pos2.z);
          const depthFactor = Math.max(0.5, Math.min(1, depthDiff));
          const adjustedMinDistance = minDistance * depthFactor;

          const dist = Math.sqrt(
            Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
          );

          if (dist < adjustedMinDistance) {
            overlappingCount++;
            if (overlappingCount > maxOverlaps) {
              shouldShow = false;
              break;
            }
          }
        }
      }

      // Update label visibility and scale
      label.visible = shouldShow;
      if (shouldShow) {
        const distance = pos1.z;
        // Adjusted scale calculation for better visibility at different distances
        const baseScale = 0.6; // Increased base scale (was 0.4)
        const minScale = 0.4; // Increased minimum scale (was 0.3)
        const maxScale = 2.0; // Increased maximum scale (was 1.2)
        
        // Use cube root for more gradual scaling at distance
        const scale = Math.max(
          minScale,
          Math.min(maxScale, baseScale * Math.pow(distance, 0.33))
        );
        
        // Apply scale while maintaining aspect ratio
        const baseScaleVector = label.scale.clone().normalize();
        label.scale.copy(baseScaleVector.multiplyScalar(scale));
        
        // Make label face camera
        label.quaternion.copy(camera.quaternion);
      }
    });
  }

  public clear(): void {
    this.visualizations.forEach((vis) => {
      if (vis.points) this.scene.remove(vis.points);
      if (vis.lines) this.scene.remove(vis.lines);
      if (vis.surface) {
        this.scene.remove(vis.surface);
        if (vis.wireframe) this.scene.remove(vis.wireframe);
      }
    });
    this.visualizations.clear();
  }

  private updateVisibility(): void {
    this.visualizations.forEach((vis) => {
      vis.visible = this.activeMode;
    });
  }

  public show(visualization: any): void {
    if (visualization.points) {
      visualization.points.visible = true;
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        sphere.visible = true;
      });
    }
    if (visualization.lines) visualization.lines.visible = true;
    if (visualization.surface) visualization.surface.visible = true;
    if (visualization.wireframe) visualization.wireframe.visible = true;
    if (visualization.label && this.showLabelsGlobal) {
      visualization.label.visible = true;
    }
  }

  public hide(visualization: any): void {
    if (visualization.points) {
      visualization.points.visible = false;
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        sphere.visible = false;
      });
    }
    if (visualization.lines) visualization.lines.visible = false;
    if (visualization.surface) visualization.surface.visible = false;
    if (visualization.wireframe) visualization.wireframe.visible = false;
    if (visualization.label) {
      visualization.label.visible = false;
    }
  }

  public setGlobalLabelVisibility(visible: boolean): void {
    this.showLabelsGlobal = visible;
    this.visualizations.forEach((visualization) => {
      if (visualization.label) {
        visualization.label.visible = visible;
      }
    });
    if (visible) {
      // Reset camera tracking when enabling labels
      this.lastCameraPosition.copy(this.camera.position);
      this.lastCameraQuaternion.copy(this.camera.quaternion);
      this.updateLabels();
    }
  }
}
