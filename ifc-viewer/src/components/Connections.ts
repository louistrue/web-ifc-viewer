import * as THREE from "three";
import { IFCViewer } from "../app";
import {
  FastIntersectionDetector,
  IntersectionVisualizer,
} from "../connection-utils";
import { IFCModel } from "../types";

interface ElementInfo {
  object: THREE.Object3D;
  modelID: number;
  expressID: number;
}

interface Connection {
  id: string;
  elements: ElementInfo[];
  type: "point" | "line" | "surface";
  measurements: {
    area?: number;
    length?: number;
  };
  visualization: any; // TODO: Define proper type from IntersectionVisualizer
}

interface ConnectionVisualization {
  points?: THREE.Points;
  lines?: THREE.LineSegments;
  surface?: THREE.Mesh;
}

interface ConnectionData {
  elements: ElementInfo[];
  connections: Map<string, Connection>;
  statistics: any; // Define the structure of statistics
}

export class Connections {
  private viewer: IFCViewer;
  private connectionDetector: FastIntersectionDetector | null;
  private connectionVisualizer: IntersectionVisualizer | null;
  private elementConnections: Map<number, Set<string>>;
  private connections: Map<number, Map<string, Connection>>;
  private connectionVisualizations: Map<string, ConnectionVisualization>;
  private isConnectionMode: boolean;
  private connectionData: ConnectionData | null = null;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.connectionDetector = null;
    this.connectionVisualizer = null;
    this.elementConnections = new Map();
    this.connections = new Map();
    this.connectionVisualizations = new Map();
    this.isConnectionMode = false;
  }

  public async analyzeConnections(): Promise<void> {
    try {
      // Initialize connection detector if not already done
      if (!this.connectionDetector) {
        this.connectionDetector = new FastIntersectionDetector();
      }

      // Create visualizer if not exists
      if (!this.connectionVisualizer) {
        this.connectionVisualizer = new IntersectionVisualizer(
          this.viewer.getScene(),
          this.viewer.getCamera()
        );
      }
      this.isConnectionMode = true;
      this.connectionVisualizer.setConnectionMode(true);

      // Set model elements semi-transparent
      this.viewer.models.forEach((model: IFCModel) => {
        model.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!mesh.userData.originalMaterial) {
              mesh.userData.originalMaterial = mesh.material.clone();
            }
            (mesh.material as THREE.Material).transparent = true;
            (mesh.material as THREE.Material).opacity = 0.3;
            (mesh.material as THREE.Material).depthWrite = false;
            (mesh.material as THREE.Material).needsUpdate = true;
          }
        });
      });

      // Get all elements from the scene
      const elements = this.getAllElements();
      if (elements.length === 0) {
        throw new Error("No elements found in scene");
      }

      // Setup detector for each model
      this.viewer.models.forEach((model: IFCModel) => {
        if (this.connectionDetector) {
          this.connectionDetector.setupBoundingBoxes(model);
        }
      });

      // Analyze connections between elements
      const connections = await this.findConnections(elements);

      // Store connection data
      this.connectionData = {
        elements,
        connections,
        statistics: this.calculateStatistics(connections),
      };

      // Visualize connections
      this.visualizeConnections(connections);

      // Update UI
      this.updateConnectionsUI();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to analyze connections:", errorMessage);

      // Show error in UI
      this.showError(errorMessage);
    }
  }

  private showError(message: string): void {
    const connectionsPanel = document.querySelector(".connections-panel");
    if (!connectionsPanel) return;

    const errorDiv = document.createElement("div");
    errorDiv.className = "connections-error";
    errorDiv.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-circle"></i>
        <span>Failed to analyze connections: ${message}</span>
      </div>
      <button class="retry-button">
        <i class="fas fa-redo"></i>
        Retry Analysis
      </button>
    `;

    // Add retry handler
    const retryButton = errorDiv.querySelector(".retry-button");
    if (retryButton) {
      retryButton.addEventListener("click", () => {
        errorDiv.remove();
        this.analyzeConnections();
      });
    }

    // Clear existing content and show error
    connectionsPanel.innerHTML = "";
    connectionsPanel.appendChild(errorDiv);
  }

  private getAllElements(): ElementInfo[] {
    const elements: ElementInfo[] = [];
    this.viewer.models.forEach((model: IFCModel) => {
      model.traverse((child: THREE.Object3D) => {
        if (child.name.startsWith("Element_")) {
          elements.push({
            object: child,
            modelID: (child as any).modelID,
            expressID: (child as any).expressID,
          });
        }
      });
    });
    return elements;
  }

  private async findConnections(
    elements: ElementInfo[]
  ): Promise<Map<string, Connection>> {
    const connections = new Map<string, Connection>();

    // Process elements in chunks to avoid blocking the UI
    const chunkSize = 10;
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        if (j % chunkSize === 0) {
          // Allow UI to update
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const intersection = await this.findIntersection(
          elements[i].object,
          elements[j].object
        );

        if (intersection) {
          const connectionId = `${elements[i].expressID}-${elements[j].expressID}`;
          const connection = {
            id: connectionId,
            elements: [elements[i], elements[j]],
            type: intersection.type,
            measurements: intersection.measurements,
            visualization: intersection,
          };
          connections.set(connectionId, connection);

          // Track elements with connections
          elements[i].object.userData.hasConnections = true;
          elements[j].object.userData.hasConnections = true;

          // Store connection references
          if (!this.elementConnections.has(elements[i].expressID)) {
            this.elementConnections.set(elements[i].expressID, new Set());
          }
          if (!this.elementConnections.has(elements[j].expressID)) {
            this.elementConnections.set(elements[j].expressID, new Set());
          }
          this.elementConnections.get(elements[i].expressID)?.add(connectionId);
          this.elementConnections.get(elements[j].expressID)?.add(connectionId);
        }
      }
    }

    return connections;
  }

  private async findIntersection(
    object1: THREE.Object3D,
    object2: THREE.Object3D
  ): Promise<any | null> {
    if (this.connectionDetector) {
      return this.connectionDetector.findIntersection(object1, object2);
    }
    return null;
  }

  private calculateStatistics(connections: Map<string, Connection>): any {
    // Implementation of calculateStatistics method
    return {};
  }

  private updateConnectionsUI(): void {
    // Implementation of updateConnectionsUI method
  }

  private updateElementConnections(
    expressId1: number,
    expressId2: number,
    connectionId: string
  ): void {
    if (!this.elementConnections.has(expressId1)) {
      this.elementConnections.set(expressId1, new Set());
    }
    if (!this.elementConnections.has(expressId2)) {
      this.elementConnections.set(expressId2, new Set());
    }
    this.elementConnections.get(expressId1)?.add(connectionId);
    this.elementConnections.get(expressId2)?.add(connectionId);
  }

  public exitConnectionMode(): void {
    this.isConnectionMode = false;

    // Reset model materials
    this.viewer.models.forEach((model: IFCModel) => {
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.userData.originalMaterial) {
            mesh.material = mesh.userData.originalMaterial;
            delete mesh.userData.originalMaterial;
          }
        }
      });
    });

    // Clear visualizations
    if (this.connectionVisualizer) {
      this.connectionVisualizer.setConnectionMode(false);
      this.connectionVisualizer.clear();
    }

    // Clear stored data
    this.connectionData = null;
    this.connectionVisualizations.clear();
  }

  private visualizeConnections(connections: Map<string, Connection>): void {
    if (!this.connectionVisualizer) return;

    // Clear existing visualizations
    this.connectionVisualizations.forEach((vis) => {
      if (vis.points) this.scene.remove(vis.points);
      if (vis.lines) this.scene.remove(vis.lines);
      if (vis.surface) {
        this.scene.remove(vis.surface);
        if (vis.wireframe) this.scene.remove(vis.wireframe);
      }
    });
    this.connectionVisualizations.clear();

    // Create new visualizations
    connections.forEach((connection) => {
      const visualization = this.connectionVisualizer.visualize(
        connection.visualization
      );
      this.connectionVisualizations.set(connection.id, visualization);
    });
  }

  private updateConnectionsPanel(
    modelId: number,
    connections: Map<string, Connection>
  ): void {
    const connectionsList = document.querySelector(".connections-list");
    if (!connectionsList) return;

    connectionsList.innerHTML = "";

    // Create connection type groups
    const connectionsByType: Record<string, Connection[]> = {
      point: [],
      line: [],
      surface: [],
    };

    connections.forEach((connection: Connection) => {
      connectionsByType[connection.type].push(connection);
    });

    this.createSummarySection(connectionsList, connectionsByType);
    this.createTypeSections(connectionsList, connectionsByType);
  }

  private createSummarySection(
    connectionsList: HTMLElement,
    connectionsByType: Record<string, Connection[]>
  ): void {
    const summarySection = document.createElement("div");
    summarySection.className = "connections-summary";
    summarySection.innerHTML = `
      <div class="summary-item">
        <span class="summary-icon" style="color: #ff3366"><i class="fas fa-circle"></i></span>
        <span class="summary-count">${connectionsByType.point.length}</span>
        <span class="summary-label">Point Connections</span>
      </div>
      <div class="summary-item">
        <span class="summary-icon" style="color: #33ff66"><i class="fas fa-minus"></i></span>
        <span class="summary-count">${connectionsByType.line.length}</span>
        <span class="summary-label">Line Connections</span>
      </div>
      <div class="summary-item">
        <span class="summary-icon" style="color: #3366ff"><i class="fas fa-square"></i></span>
        <span class="summary-count">${connectionsByType.surface.length}</span>
        <span class="summary-label">Surface Connections</span>
      </div>
    `;
    connectionsList.appendChild(summarySection);
  }

  private createTypeSections(
    connectionsList: HTMLElement,
    connectionsByType: Record<string, Connection[]>
  ): void {
    Object.entries(connectionsByType).forEach(([type, typeConnections]) => {
      if (typeConnections.length === 0) return;

      const typeSection = document.createElement("div");
      typeSection.className = "connection-type-section";

      this.createTypeHeader(typeSection, type);
      this.createTypeContent(
        typeSection,
        typeConnections,
        type,
        connectionsList
      );

      connectionsList.appendChild(typeSection);
    });
  }

  private createTypeHeader(typeSection: HTMLElement, type: string): void {
    const typeHeader = document.createElement("div");
    typeHeader.className = "type-header";
    typeHeader.innerHTML = `
      <div class="type-title">
        <span class="type-icon" style="color: ${
          this.connectionVisualizer?.colors?.[type] || "#000000"
        }">
          <i class="fas fa-${
            type === "point" ? "circle" : type === "line" ? "minus" : "square"
          }"></i>
        </span>
        <span>${type.charAt(0).toUpperCase() + type.slice(1)} Connections</span>
      </div>
      <button class="type-toggle">
        <i class="fas fa-chevron-down"></i>
      </button>
    `;
    typeSection.appendChild(typeHeader);

    // Add type section toggle
    typeHeader.addEventListener("click", () => {
      typeSection.classList.toggle("collapsed");
      const icon = typeHeader.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-chevron-down");
        icon.classList.toggle("fa-chevron-right");
      }
    });
  }

  private createTypeContent(
    typeSection: HTMLElement,
    typeConnections: Connection[],
    type: string,
    connectionsList: HTMLElement
  ): void {
    const typeContent = document.createElement("div");
    typeContent.className = "type-content";

    typeConnections.forEach((connection) => {
      const item = document.createElement("div");
      item.className = "connection-item";
      item.dataset.connectionId = connection.id;

      const measurements = connection.measurements;
      const measurementText =
        type === "surface"
          ? `Area: ${measurements.area?.toFixed(2)} m²`
          : `Length: ${measurements.length?.toFixed(2)} m`;

      item.innerHTML = `
        <div class="connection-header">
          <div class="connection-info">
            <div class="connection-elements">
              <span>Elements ${connection.elements[0].expressID} ↔ ${connection.elements[1].expressID}</span>
            </div>
            <div class="connection-measurement">${measurementText}</div>
          </div>
        </div>
      `;

      // Add click handler for the item
      item.addEventListener("click", () => {
        // Remove previous selection
        connectionsList
          .querySelectorAll(".connection-item")
          .forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");

        this.zoomToConnection(connection);
      });

      typeContent.appendChild(item);
    });

    typeSection.appendChild(typeContent);
  }

  private zoomToConnection(connection: Connection): void {
    // Create bounding box encompassing all connected elements and visualization
    const bbox = new THREE.Box3();

    // Add connected elements to bbox
    connection.elements.forEach((element) => {
      const elementBox = new THREE.Box3().setFromObject(element.object);
      bbox.union(elementBox);
    });

    // Add visualization to bbox
    const visualization = this.connectionVisualizations.get(connection.id);
    if (visualization) {
      if (visualization.points) bbox.expandByObject(visualization.points);
      if (visualization.lines) bbox.expandByObject(visualization.lines);
      if (visualization.surface) bbox.expandByObject(visualization.surface);

      // Highlight the connection
      if (this.connectionVisualizer) {
        this.connectionVisualizer.highlight(visualization);
        if (this.connectionVisualizer.showLabelsGlobal) {
          this.connectionVisualizer.showLabels(visualization);
          this.connectionVisualizer.updateLabels();
        }
      }
    }

    // Get bbox center and size
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.viewer.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding

    // Animate camera movement
    const currentPosition = this.viewer.camera.position.clone();
    const currentTarget = this.viewer.controls.target.clone();
    const newPosition = new THREE.Vector3(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.5,
      center.z + cameraZ
    );

    this.animateCamera(
      currentPosition,
      newPosition,
      currentTarget,
      center,
      1000
    );
  }

  private animateCamera(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    startTarget: THREE.Vector3,
    endTarget: THREE.Vector3,
    duration: number
  ): void {
    const startTime = performance.now();

    const animate = (currentTime: number): void => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease function (cubic)
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      // Update camera position
      this.viewer.camera.position.lerpVectors(startPos, endPos, ease);

      // Update controls target
      this.viewer.controls.target.lerpVectors(startTarget, endTarget, ease);
      this.viewer.controls.update();

      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}
