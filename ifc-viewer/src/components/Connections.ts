import * as THREE from "three";
import { IFCViewer } from "../app";
import {
  FastIntersectionDetector,
  IntersectionVisualizer,
} from "../connection-utils";
import { IFCModel, IntersectionResult } from "../types";

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
  geometry: {
    points?: THREE.BufferGeometry;
    lines?: THREE.BufferGeometry;
    surface?: THREE.BufferGeometry;
  };
  visualization: any;
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

// For collecting all raw intersections
interface RawIntersection {
  point: THREE.Vector3;
  pairs: [ElementInfo, ElementInfo]; // which pair produced this point
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
  private rawIntersections: RawIntersection[] = [];
  private scene: THREE.Scene;

  constructor(viewer: IFCViewer) {
    this.viewer = viewer;
    this.connectionDetector = null;
    this.connectionVisualizer = null;
    this.elementConnections = new Map();
    this.connections = new Map();
    this.connectionVisualizations = new Map();
    this.isConnectionMode = false;
    this.scene = viewer.getScene();

    // Setup deselection handler
    this.setupDeselection();
  }

  public async analyzeConnections(): Promise<void> {
    try {
      // Wait a short time to ensure model is loaded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Initialize connection detector if not already done
      if (!this.connectionDetector) {
        this.connectionDetector = new FastIntersectionDetector();
      }

      // Create visualizer if not exists
      if (!this.connectionVisualizer) {
        this.connectionVisualizer = new IntersectionVisualizer(
          this.scene,
          this.viewer.getCamera()
        );
      }

      // Get all elements from the scene
      const elements = this.getAllElements();
      if (elements.length === 0) {
        throw new Error(
          "No elements found in scene. Please load a model first."
        );
      }

      console.log(`Found ${elements.length} elements to analyze`);

      this.isConnectionMode = true;
      this.connectionVisualizer.setConnectionMode(true);

      // Set model elements semi-transparent
      this.viewer.getModels().forEach((model: IFCModel) => {
        model.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (!mesh.userData.originalMaterial) {
              const material = mesh.material as THREE.Material;
              mesh.userData.originalMaterial = material.clone();
            }
            (mesh.material as THREE.Material).transparent = true;
            (mesh.material as THREE.Material).opacity = 0.3;
            (mesh.material as THREE.Material).depthWrite = false;
            (mesh.material as THREE.Material).needsUpdate = true;
          }
        });
      });

      // Setup detector for each model
      this.viewer.getModels().forEach((model: IFCModel) => {
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
      await this.visualizeConnections(connections);

      // Update UI
      this.updateConnectionsUI();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to analyze connections:", errorMessage);
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

    this.viewer.getModels().forEach((model: IFCModel) => {
      model.traverse((child: THREE.Object3D) => {
        // Check if it's an element group
        if (child.name.startsWith("Element_") && child.userData.expressID) {
          elements.push({
            object: child,
            modelID: model.modelID, // Use the model's ID
            expressID: child.userData.expressID,
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

    // Compare each element with every other element
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const element1 = elements[i];
        const element2 = elements[j];

        // Find intersection between the two elements
        const intersection = await this.findIntersection(
          element1.object,
          element2.object
        );

        if (intersection) {
          // Create a unique ID for this connection
          const connectionId = `${element1.expressID}-${element2.expressID}`;

          // Create connection object
          const connection: Connection = {
            id: connectionId,
            elements: [element1, element2],
            type: intersection.type,
            measurements: intersection.measurements,
            geometry: intersection.geometry,
            visualization: null,
          };

          // Store the connection
          connections.set(connectionId, connection);

          // Update element-connection mappings
          this.updateElementConnections(
            element1.expressID,
            element2.expressID,
            connectionId
          );
        }
      }
    }

    return connections;
  }

  private async findIntersection(
    object1: THREE.Object3D,
    object2: THREE.Object3D
  ): Promise<IntersectionResult | null> {
    if (!this.connectionDetector) return null;
    return this.connectionDetector.findIntersection(object1, object2);
  }

  private calculateStatistics(connections: Map<string, Connection>): any {
    // Implementation of calculateStatistics method
    return {};
  }

  private updateConnectionsUI(): void {
    const connectionsList = document.querySelector(".connections-list");
    if (!connectionsList || !this.connectionData) return;

    // Clear existing content
    connectionsList.innerHTML = "";

    // Create connection type groups with unique connections
    const connectionsByType = {
      surface: [] as Connection[],
      line: [] as Connection[],
      point: [] as Connection[],
    };

    // Group connections by type
    this.connectionData.connections.forEach((connection) => {
      connectionsByType[connection.type].push(connection);
    });

    // Create summary section
    this.createSummarySection(connectionsList, connectionsByType);

    // Create type sections in specific order
    const typeOrder = ["surface", "line", "point"] as const;
    const createdSections = new Set<string>();

    typeOrder.forEach((type) => {
      if (createdSections.has(type)) return;
      const connections = connectionsByType[type];
      if (connections.length > 0) {
        this.createTypeSection(connectionsList, type, connections);
        createdSections.add(type);
      }
    });
  }

  private async exportConnectionsCSV(): Promise<void> {
    if (!this.connectionData) return;

    // Create CSV header
    const headers = [
      "Connection Type",
      "Element 1 ID",
      "Element 1 Name",
      "Element 2 ID",
      "Element 2 Name",
      "Measurement Type",
      "Measurement Value",
      "Unit",
    ];

    // Prepare rows
    const rows: string[][] = [];

    for (const connection of this.connectionData.connections.values()) {
      const element1Name = await this.getElementName(
        connection.elements[0].modelID,
        connection.elements[0].expressID
      );
      const element2Name = await this.getElementName(
        connection.elements[1].modelID,
        connection.elements[1].expressID
      );

      let measurementType = "";
      let measurementValue = "";
      let unit = "";

      if (connection.type === "surface" && connection.measurements?.area) {
        measurementType = "Area";
        measurementValue = connection.measurements.area.toFixed(2);
        unit = "m²";
      } else if (
        connection.type === "line" &&
        connection.measurements?.length
      ) {
        measurementType = "Length";
        measurementValue = connection.measurements.length.toFixed(2);
        unit = "m";
      } else if (connection.type === "point") {
        measurementType = "Point";
        measurementValue = "N/A";
        unit = "N/A";
      }

      rows.push([
        connection.type,
        connection.elements[0].expressID.toString(),
        element1Name,
        connection.elements[1].expressID.toString(),
        element2Name,
        measurementType,
        measurementValue,
        unit,
      ]);
    }

    // Convert to CSV string
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "connections.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    console.log("Exiting connection mode");
    this.isConnectionMode = false;

    // Reset section box
    this.clearSectionBox();

    // Reset model materials and make them fully opaque
    this.viewer.getModels().forEach((model: IFCModel) => {
      model.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.userData.originalMaterial) {
            mesh.material = mesh.userData.originalMaterial;
            delete mesh.userData.originalMaterial;
          }
          (mesh.material as THREE.Material).transparent = false;
          (mesh.material as THREE.Material).opacity = 1;
          (mesh.material as THREE.Material).depthWrite = true;
          (mesh.material as THREE.Material).needsUpdate = true;
        }
      });
    });

    // Clean up visualizer without moving camera
    if (this.connectionVisualizer) {
      console.log("Clearing connection visualizer");
      this.connectionVisualizer.clear();
      this.connectionVisualizer.setConnectionMode(false);
      // Removed camera reset
    }

    // Clear stored data
    this.connectionData = null;
    this.connectionVisualizations.clear();

    // Clear UI selections
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("selected", "sectioned");
      const sectionBtn = item.querySelector(".section-btn");
      if (sectionBtn) {
        sectionBtn.classList.remove("active");
      }
    });

    // Disable connection mode
    this.viewer.setConnectionMode(false);
    this.connectionVisualizer?.setConnectionMode(false);
  }

  private clearSectionBox(): void {
    this.viewer.setSectionBox(null);

    // Clear sectioned state from all connection items
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("sectioned");
      const sectionBtn = item.querySelector(".section-btn");
      if (sectionBtn) {
        sectionBtn.classList.remove("active");
      }
    });
  }

  // Add this method to handle toolbar interactions
  public handleToolbarAction(action: string): void {
    if (action === "showAll") {
      this.clearSectionBox();
    }
  }

  private async visualizeConnections(
    connections: Map<string, Connection>
  ): Promise<void> {
    if (!this.connectionVisualizer) return;

    this.connectionVisualizer.clear();
    this.connectionVisualizer.setConnectionMode(true);
    this.connectionVisualizations.clear();

    for (const [id, connection] of connections) {
      try {
        if (!connection.geometry) continue;

        const visualization = this.connectionVisualizer.createVisualization({
          id,
          type: connection.type,
          geometry: connection.geometry,
          measurements: connection.measurements,
        });

        if (visualization) {
          this.connectionVisualizations.set(id, visualization);
          connection.visualization = visualization;
        }
      } catch (error) {
        console.error(`Failed to visualize connection ${id}:`, error);
      }
    }
  }

  private createSummarySection(
    container: Element,
    connectionsByType: Record<string, Connection[]>
  ): void {
    const summary = document.createElement("div");
    summary.className = "connections-summary";

    const header = document.createElement("div");
    header.className = "summary-header";

    const title = document.createElement("h3");
    title.textContent = "Connection Summary";

    const exportButton = document.createElement("button");
    exportButton.className = "summary-export-btn";
    exportButton.innerHTML = `
      <i class="fas fa-file-export"></i>
      Export CSV
    `;
    exportButton.addEventListener("click", () => this.exportConnectionsCSV());

    header.appendChild(title);
    header.appendChild(exportButton);

    // Create statistics content
    const content = document.createElement("div");
    content.className = "summary-content";

    const types = [
      {
        type: "surface",
        icon: "square",
        label: "Surface",
        color: this.connectionVisualizer?.colors.surface || "#4CAF50",
      },
      {
        type: "line",
        icon: "minus",
        label: "Line",
        color: this.connectionVisualizer?.colors.line || "#2196F3",
      },
      {
        type: "point",
        icon: "circle",
        label: "Point",
        color: this.connectionVisualizer?.colors.point || "#FFC107",
      },
    ];

    types.forEach(({ type, icon, label, color }) => {
      const count = connectionsByType[type].length;
      const item = document.createElement("div");
      item.className = "summary-item";
      item.innerHTML = `
        <div class="summary-icon" style="background: ${color}20; color: ${color}">
          <i class="fas fa-${icon}"></i>
      </div>
        <div class="summary-count">${count}</div>
        <div class="summary-label">${label} Connections</div>
      `;
      content.appendChild(item);
    });

    summary.appendChild(header);
    summary.appendChild(content);
    container.appendChild(summary);
  }

  private async createTypeSection(
    connectionsList: HTMLElement,
    type: string,
    connections: Connection[]
  ): Promise<void> {
    const section = document.createElement("div");
    section.className = "connection-type-section";

    // Create section header with collapse button
    const header = document.createElement("div");
    header.className = "type-header";
    header.innerHTML = `
      <div class="type-title">
        <span class="collapse-icon">
          <i class="fas fa-chevron-down"></i>
        </span>
        <span class="type-icon" style="color: ${
          this.connectionVisualizer?.colors[type]
        }">
          <i class="fas fa-${
            type === "point" ? "circle" : type === "line" ? "minus" : "square"
          }"></i>
        </span>
        <span>${type.charAt(0).toUpperCase() + type.slice(1)} Connections</span>
      </div>
      <span class="type-count">${connections.length}</span>
    `;
    section.appendChild(header);

    // Create connection items container
    const content = document.createElement("div");
    content.className = "type-content";

    // Add collapse functionality
    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
      const icon = header.querySelector(".collapse-icon i");
      if (icon) {
        icon.classList.toggle("fa-chevron-down");
        icon.classList.toggle("fa-chevron-right");
      }
    });

    // Create items asynchronously
    await Promise.all(
      connections.map((connection) =>
        this.createConnectionItem(connection, type, content)
      )
    );

    section.appendChild(content);
    connectionsList.appendChild(section);
  }

  private async createConnectionItem(
    connection: Connection,
    type: string,
    content: HTMLElement
  ): Promise<void> {
    const item = document.createElement("div");
    item.className = "connection-item";
    item.dataset.connectionId = connection.id;

    // Get element names and truncate if too long
    const element1Name = await this.getElementName(
      connection.elements[0].modelID,
      connection.elements[0].expressID
    );
    const element2Name = await this.getElementName(
      connection.elements[1].modelID,
      connection.elements[1].expressID
    );

    const measurements = connection.measurements;
    let measurementText = "";

    if (type === "surface" && measurements?.area) {
      measurementText = `Area: ${measurements.area.toFixed(2)} m²`;
    } else if (type === "line" && measurements?.length) {
      measurementText = `Length: ${measurements.length.toFixed(2)} m`;
    } else if (type === "point") {
      measurementText = "Point Connection";
    }

    item.innerHTML = `
        <div class="connection-header">
          <div class="connection-info">
            <div class="connection-elements">
            <div class="element-name" title="${element1Name}">${element1Name}</div>
            <div class="connection-arrow">↔</div>
            <div class="element-name" title="${element2Name}">${element2Name}</div>
            </div>
          ${
            measurementText
              ? `<div class="connection-measurement">${measurementText}</div>`
              : ""
          }
        </div>
        <div class="connection-actions">
          <button class="action-btn section-btn" title="Create Section Box">
            <i class="fas fa-cube"></i>
          </button>
          </div>
        </div>
      `;

    // Add click handler for the entire item (zoom)
    item.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent container click from triggering deselection
      if (!(e.target as HTMLElement).closest(".section-btn")) {
        const wasSelected = item.classList.contains("selected");

        // Remove previous selection
        content
          .querySelectorAll(".connection-item")
          .forEach((i) => i.classList.remove("selected"));

        // Toggle selection
        if (!wasSelected) {
          item.classList.add("selected");
          // Reset section box
          this.viewer.setSectionBox(null);
          // Zoom to connection
          this.zoomToConnection(connection);
        } else {
          // Deselect if clicking the same item
          this.deselectAll();
        }
      }
    });

    // Add section box button handler
    const sectionBtn = item.querySelector(".section-btn");
    if (sectionBtn) {
      sectionBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        // Toggle section box
        if (item.classList.contains("sectioned")) {
          this.clearSectionBox();
        } else {
          // Remove section from other items
          content.querySelectorAll(".connection-item").forEach((i) => {
            i.classList.remove("sectioned");
            i.querySelector(".section-btn")?.classList.remove("active");
          });

          // Add section box for this connection
          this.createSectionBoxForConnection(connection);
          item.classList.add("sectioned");
          sectionBtn.classList.add("active");
        }
      });
    }

    content.appendChild(item);
  }

  private createSectionBoxForConnection(connection: Connection): void {
    console.log("Creating section box for connection:", connection.id);
    const visualization = this.connectionVisualizations.get(connection.id);

    if (!visualization) {
      console.warn(`No visualization found for connection ${connection.id}`);
      return;
    }

    // Create bounding box for the connection
    const bbox = new THREE.Box3();
    console.log("Initial bbox:", bbox);

    // Add visualization geometry to bbox
    if (visualization.points) {
      console.log("Adding points to section bbox");
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        bbox.expandByObject(sphere);
      });
    }
    if (visualization.lines) {
      console.log("Adding lines to section bbox");
      bbox.expandByObject(visualization.lines);
    }
    if (visualization.surface) {
      console.log("Adding surface to section bbox");
      bbox.expandByObject(visualization.surface);
    }

    // Add padding
    const padding = 0.5;
    bbox.min.subScalar(padding);
    bbox.max.addScalar(padding);
    console.log("Final bbox with padding:", bbox);

    // Create section box
    console.log("Setting section box");
    this.viewer.setSectionBox(bbox);
  }

  private zoomToConnection(connection: Connection): void {
    console.log("Attempting to zoom to connection:", connection.id);
    if (!this.connectionVisualizer) {
      console.warn("No connection visualizer available");
      return;
    }

    const visualization = this.connectionVisualizations.get(connection.id);
    console.log("Found visualization:", visualization ? "yes" : "no");

    if (!visualization) {
      console.warn(`No visualization found for connection ${connection.id}`);
      return;
    }

    // Create bounding box for the connection
    const bbox = new THREE.Box3();

    // Add visualization geometry to bbox
    if (visualization.points) {
      console.log("Adding points to bbox");
      visualization.points.children.forEach((sphere: THREE.Mesh) => {
        bbox.expandByObject(sphere);
      });
    }
    if (visualization.lines) {
      console.log("Adding lines to bbox");
      bbox.expandByObject(visualization.lines);
    }
    if (visualization.surface) {
      console.log("Adding surface to bbox");
      bbox.expandByObject(visualization.surface);
    }

    // Highlight the connection
    this.connectionVisualizer.highlight(visualization);
    if (this.connectionVisualizer.showLabelsGlobal) {
      this.connectionVisualizer.showLabels(visualization);
      this.connectionVisualizer.updateLabels();
    }

    // Get bbox center and size
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bbox.getCenter(center);
    bbox.getSize(size);

    // Calculate camera position
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.viewer.getCamera().fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));

    // Add padding based on connection type
    const padding =
      connection.type === "surface"
        ? 2.0
        : connection.type === "line"
        ? 1.5
        : 4.0;
    cameraZ *= padding;

    // Calculate offset direction and camera position
    let offsetDirection = new THREE.Vector3(1, 1, 1).normalize();
    let newPosition: THREE.Vector3;

    if (connection.type === "line" && visualization.lines) {
      // For lines, position camera perpendicular to line direction and centered
      const positions = visualization.lines.geometry.getAttribute("position");
      if (positions && positions.count >= 2) {
        // Get line start and end points
        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        start.fromBufferAttribute(positions, 0);
        end.fromBufferAttribute(positions, positions.count - 1);

        // Calculate line direction
        const lineDirection = end.clone().sub(start).normalize();

        // Calculate perpendicular vector (cross with up vector)
        offsetDirection = lineDirection
          .clone()
          .cross(new THREE.Vector3(0, 1, 0))
          .normalize();

        // If the cross product is zero (line is vertical), use another direction
        if (offsetDirection.lengthSq() < 0.1) {
          offsetDirection = lineDirection
            .clone()
            .cross(new THREE.Vector3(1, 0, 0))
            .normalize();
        }

        // Position camera to see full line length
        const lineLength = end.distanceTo(start);
        cameraZ = Math.max(cameraZ, lineLength * 0.75); // Ensure we can see full line

        // Calculate camera position perpendicular to line
        newPosition = center
          .clone()
          .add(offsetDirection.multiplyScalar(cameraZ));
      } else {
        newPosition = center
          .clone()
          .add(offsetDirection.multiplyScalar(cameraZ));
      }
    } else if (connection.type === "surface" && visualization.surface) {
      // Use surface normal for surfaces
      const normalAttribute =
        visualization.surface.geometry.getAttribute("normal");
      if (normalAttribute) {
        offsetDirection = new THREE.Vector3();
        offsetDirection.fromBufferAttribute(normalAttribute, 0);
        offsetDirection.transformDirection(visualization.surface.matrixWorld);
      }
      newPosition = center.clone().add(offsetDirection.multiplyScalar(cameraZ));
    } else {
      // Default position for points
      newPosition = center.clone().add(offsetDirection.multiplyScalar(cameraZ));
    }

    // Animate camera movement
    const currentPosition = this.viewer.getCamera().position.clone();
    const currentTarget = this.viewer.getControls().target.clone();

    this.animateCamera(
      currentPosition,
      newPosition,
      currentTarget,
      center,
      1000 // 1 second duration
    );

    // Unhighlight other connections
    this.connectionVisualizations.forEach((vis, id) => {
      if (id !== connection.id) {
        this.connectionVisualizer?.unhighlight(vis);
      }
    });
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
      this.viewer.getCamera().position.lerpVectors(startPos, endPos, ease);

      // Update controls target
      this.viewer
        .getControls()
        .target.lerpVectors(startTarget, endTarget, ease);
      this.viewer.getControls().update();

      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Collect all intersection points from a pairwise result, saving them for multi-element analysis.
   */
  private collectRawIntersections(
    points: THREE.Vector3[] | undefined,
    elemA: ElementInfo,
    elemB: ElementInfo
  ) {
    if (!points) return;
    for (const pt of points) {
      this.rawIntersections.push({
        point: pt.clone(),
        pairs: [elemA, elemB],
      });
    }
  }

  /**
   * We only want to keep "point" connections if 3+ elements converge on the same coordinate.
   * So let's look at rawIntersections and see how many distinct elements share that point.
   */
  private refinePointIntersections(connections: Map<string, Connection>) {
    // Group intersection points by approximate location
    const grouped: Map<string, Set<number>> = new Map();
    // Each map entry: key is a location "x|y|z" string, value is a set of expressIDs

    const tolerance = 0.001; // 1 mm tolerance
    for (const raw of this.rawIntersections) {
      // Round coordinates to reduce floating error
      const rx = Math.round(raw.point.x / tolerance),
        ry = Math.round(raw.point.y / tolerance),
        rz = Math.round(raw.point.z / tolerance);

      const locationKey = `${rx},${ry},${rz}`;

      if (!grouped.has(locationKey)) {
        grouped.set(locationKey, new Set());
      }
      const idSet = grouped.get(locationKey)!;

      // Add both elements from the pair
      idSet.add(raw.pairs[0].expressID);
      idSet.add(raw.pairs[1].expressID);
    }

    // Now any locationKey that has 3+ distinct element IDs is a multi-element point intersection
    const multiElementPoints: string[] = [];
    for (const [locKey, idSet] of grouped) {
      if (idSet.size >= 3) {
        multiElementPoints.push(locKey);
      }
    }

    // Now we decide how to handle existing "point" connections:
    for (const [connId, conn] of connections) {
      if (conn.type === "point") {
        // See if the intersection is actually multi-element or just 2 elements
        // We'll locate the raw intersection for this pair
        const a = conn.elements[0].expressID;
        const b = conn.elements[1].expressID;
        const isMulti = this.isIntersectionMultiElement(
          a,
          b,
          multiElementPoints,
          tolerance
        );

        if (!isMulti) {
          // Remove this connection if it only had 2-element touching at a single point
          connections.delete(connId);
        }
      }
    }
  }

  /**
   * Check if the pair (a,b) had an intersection location that overlaps
   * any locationKey in multiElementPoints
   */
  private isIntersectionMultiElement(
    expA: number,
    expB: number,
    multiElementPoints: string[],
    tolerance: number
  ): boolean {
    // Re-scan rawIntersections
    for (const raw of this.rawIntersections) {
      // If it's the same pair
      const [elemA, elemB] = raw.pairs;
      if (
        (elemA.expressID === expA && elemB.expressID === expB) ||
        (elemA.expressID === expB && elemB.expressID === expA)
      ) {
        // Round coordinates:
        const rx = Math.round(raw.point.x / tolerance),
          ry = Math.round(raw.point.y / tolerance),
          rz = Math.round(raw.point.z / tolerance);
        const locationKey = `${rx},${ry},${rz}`;
        if (multiElementPoints.includes(locationKey)) {
          return true;
        }
      }
    }
    return false;
  }

  private addReference(expressID: number, connectionId: string): void {
    if (!this.elementConnections.has(expressID)) {
      this.elementConnections.set(expressID, new Set());
    }
    this.elementConnections.get(expressID)?.add(connectionId);
  }

  private createLinesFromPoints(points: THREE.Vector3[]): THREE.Line3[] {
    const lines: THREE.Line3[] = [];
    if (points.length < 2) return lines;

    // Create lines between consecutive points
    for (let i = 0; i < points.length - 1; i++) {
      const line = new THREE.Line3(points[i].clone(), points[i + 1].clone());
      lines.push(line);
    }

    // For surface-like connections, close the loop
    if (points.length >= 4) {
      lines.push(
        new THREE.Line3(points[points.length - 1].clone(), points[0].clone())
      );
    }

    return lines;
  }

  private createSurfaceFromPoints(
    points: THREE.Vector3[]
  ): THREE.BufferGeometry | null {
    if (points.length < 3) return null;

    try {
      // Create a geometry from the points
      const geometry = new THREE.BufferGeometry();

      // Add vertices
      const vertices = new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]));
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3)
      );

      if (points.length === 3) {
        // For three points, just create a triangle
        geometry.setIndex([0, 1, 2]);
      } else {
        // For more points, create triangles using fan triangulation from center
        const indices: number[] = [];
        const center = new THREE.Vector3();
        points.forEach((p) => center.add(p));
        center.divideScalar(points.length);

        // Add center point as first vertex
        const allVertices = [center, ...points];
        const newVertices = new Float32Array(
          allVertices.flatMap((p) => [p.x, p.y, p.z])
        );
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(newVertices, 3)
        );

        // Create triangles
        for (let i = 1; i < allVertices.length - 1; i++) {
          indices.push(0, i, i + 1);
        }
        // Close the fan
        indices.push(0, allVertices.length - 1, 1);

        geometry.setIndex(indices);
      }

      geometry.computeVertexNormals();
      return geometry;
    } catch (error) {
      console.warn("Failed to create surface geometry:", error);
      return null;
    }
  }

  private async getElementName(
    modelID: number,
    expressID: number
  ): Promise<string> {
    try {
      if (!this.viewer.getIfcAPI()) return `Element ${expressID}`;

      const properties = await this.viewer
        .getIfcAPI()
        .properties.getItemProperties(modelID, expressID);
      return properties?.Name?.value || `Element ${expressID}`;
    } catch (error) {
      console.warn(`Failed to get name for element ${expressID}:`, error);
      return `Element ${expressID}`;
    }
  }

  // Add click handler to deselect when clicking empty space
  private setupDeselection(): void {
    console.log("Setting up deselection handler");
    const container = this.viewer.getContainer();
    container.addEventListener("click", (e: MouseEvent) => {
      console.log("Container clicked, target:", e.target);
      // Removed deselection on empty space click
    });
  }

  private deselectAll(): void {
    // Clear all selections
    const connectionItems = document.querySelectorAll(".connection-item");
    connectionItems.forEach((item) => {
      item.classList.remove("selected");
    });

    // Unhighlight all visualizations
    if (this.connectionVisualizer) {
      this.connectionVisualizations.forEach((vis) => {
        this.connectionVisualizer?.unhighlight(vis);
      });
    }
  }
}
